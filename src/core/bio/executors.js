import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import {
  BIO_FIELDS,
  BIO_FIELD_MAP,
  getActiveProfile,
  getBioAnswer,
  updateEntry
} from './store.js';
import {
  getUserWorkspaceRoot,
  validateAndResolvePath
} from '../execution/workspace.js';
import { transcribeSingleAudioChunk } from '../media/media-processor.js';
import { stageBioFile } from './staging.js';
import { wrapUntrustedContent } from '../tools/untrusted.js';

/**
 * Models that accept documents/audio/video natively as inline media in this
 * runtime (Gemini family). For them the SELECTED MODEL does the processing;
 * server-side extraction/transcription is only a fallback for other models.
 */
export function isNativeMediaModel(model) {
  return /gemini/i.test(String(model || ''));
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

function entryReadable(entry) {
  if (entry.type === 'document') return true;
  if (entry.type === 'image') return true; // delivered to the model as an image part
  // Audio/video need a tailored, per-entry grant from the user — the general
  // BIO read switch alone never exposes them.
  if (entry.type === 'audio' || entry.type === 'video') return entry.agentReadable === true;
  return false;
}

function sandboxAbsPath(userId, relPath) {
  if (!relPath || typeof relPath !== 'string') return null;
  if (relPath.startsWith('/') || relPath.startsWith('http')) return null;
  try {
    const root = getUserWorkspaceRoot(userId);
    const resolved = validateAndResolvePath(root, relPath);
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

export async function extractFileText(absPath, mime, name) {
  const buffer = fs.readFileSync(absPath);
  if (/\.pdf$/i.test(name || '') || mime === 'application/pdf') {
    const data = await pdfParse(buffer);
    return String(data?.text || '').slice(0, 20000);
  }
  if ((mime && mime.startsWith('text/')) || /\.(txt|md|json|csv)$/i.test(name || '')) {
    return buffer.toString('utf8').slice(0, 20000);
  }
  return '';
}

/**
 * bio_index: field names, types and descriptions of the ACTIVE profile.
 * Never returns values.
 */
export function executeBioIndex({ userId } = {}) {
  if (!userId) return 'Error: BIO requires an identified user.';
  const profile = getActiveProfile(userId);
  if (!profile) return 'Error: No active BIO profile exists for this user.';
  const fields = BIO_FIELDS.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    description: f.description,
    filled: hasValue(profile.fields[f.id])
  }));
  const entries = (profile.entries || []).map((e) => ({
    id: `entry:${e.id}`,
    label: e.name,
    type: e.type,
    description: e.description,
    readable: entryReadable(e)
  }));
  return JSON.stringify(
    { profileName: profile.name, profileId: profile.id, fields, entries },
    null,
    2
  );
}

/**
 * bio_get: ONLY the requested values from the ACTIVE profile.
 * Documents return extracted raw text (PDFs included), images are attached
 * to the model turn as image parts (see collectBioMediaParts), granted audio
 * is transcribed, and stored files are staged for form upload (uploadRef).
 * A profile_id that is not the active profile is denied.
 */
export async function executeBioGet({ userId, fieldIds = [], profileId = null, model = '' } = {}) {
  const nativeMedia = isNativeMediaModel(model);
  if (!userId) return 'Error: BIO requires an identified user.';
  const profile = getActiveProfile(userId);
  if (!profile) return 'Error: No active BIO profile exists for this user.';
  if (profileId && profileId !== profile.id) {
    return 'Error: BIO access denied: the requested profile is not the active profile for this run.';
  }
  const ids = Array.isArray(fieldIds) ? fieldIds : [];
  if (ids.length === 0) {
    return 'Error: bio_get requires field_ids from bio_index. No values were returned.';
  }

  const values = {};
  const uploads = {};
  const notes = [];

  const stageFile = (key, absPath, name, mime) => {
    if (!absPath) return;
    uploads[key] = {
      name,
      uploadRef: stageBioFile({ userId, absPath, name, mime })
    };
  };

  for (const rawId of ids.slice(0, 20)) {
    const id = String(rawId || '');

    if (id === 'cv') {
      const cv = profile.fields.cv;
      if (!cv || !cv.name) {
        values.cv = null;
        notes.push('cv: no CV uploaded yet');
        continue;
      }
      const abs = sandboxAbsPath(userId, cv.path);
      let text = '';
      if (abs) {
        if (nativeMedia && /\.pdf$/i.test(cv.name || '')) {
          text = '[The full CV document is attached to this result and will be processed natively by you.]';
        } else {
          try {
            text = await extractFileText(abs, cv.mime || '', cv.name);
          } catch {}
        }
        stageFile('cv', abs, cv.name, cv.mime || '');
      }
      values.cv = {
        name: cv.name,
        size: cv.size || null,
        text: text ? wrapUntrustedContent('bio-document', text) : '[CV is stored but has no extractable text yet.]'
      };
      continue;
    }

    if (id === 'photo') {
      const photoRel = profile.fields.photo || '';
      const abs = sandboxAbsPath(userId, photoRel);
      if (abs) stageFile('photo', abs, path.basename(abs), '');
      values.photo = abs
        ? '[Profile photo attached to this result for viewing, and staged for upload.]'
        : '[Profile photo is set but no sandbox file is attached.]';
      continue;
    }

    if (id.startsWith('entry:')) {
      const entry = (profile.entries || []).find((e) => e.id === id.slice(6));
      if (!entry) {
        notes.push(`${id}: not found`);
        continue;
      }
      if (!entryReadable(entry)) {
        values[id] =
          entry.type === 'audio' || entry.type === 'video'
            ? `[Stored ${entry.type} entry "${entry.name}". The user has not granted agent access to this entry.]`
            : `[Stored ${entry.type} entry "${entry.name}". Content is not returned as text.]`;
        continue;
      }
      const abs = entry.file?.path ? sandboxAbsPath(userId, entry.file.path) : null;
      if (abs) stageFile(id, abs, entry.file.name || entry.name, entry.file.mime || '');

      if (entry.type === 'document') {
        let text = entry.textContent || '';
        if (nativeMedia && /\.pdf$/i.test(entry.file?.name || entry.name || '')) {
          text = '[The full document is attached to this result and will be processed natively by you.]';
        } else if (!text && abs) {
          try {
            text = await extractFileText(abs, entry.file?.mime || '', entry.file?.name || entry.name);
            if (text) {
              try {
                updateEntry(userId, profile.id, entry.id, { textContent: text });
              } catch {}
            }
          } catch {}
        }
        values[id] = text
          ? wrapUntrustedContent('bio-document', text)
          : `[Document "${entry.name}" is stored${entry.file?.name ? ` as ${entry.file.name}` : ''} but has no extractable text.]`;
      } else if (entry.type === 'image') {
        values[id] = `[Image entry "${entry.name}" — attached to this result for viewing${abs ? ', and staged for upload' : ''}.]`;
      } else if (entry.type === 'audio') {
        if (!abs) {
          values[id] = `[Audio entry "${entry.name}" — granted, but no audio file is attached.]`;
          continue;
        }
        if (nativeMedia) {
          values[id] = `[Audio entry "${entry.name}" — the full audio is attached to this result and will be processed natively by you.]`;
          continue;
        }
        try {
          const result = await transcribeSingleAudioChunk({
            buffer: fs.readFileSync(abs),
            mimeType: entry.file?.mime || 'audio/mpeg',
            filename: entry.file?.name || 'audio.mp3'
          });
          values[id] =
            result?.ok && result.text
              ? wrapUntrustedContent('audio-transcript', result.text.slice(0, 8000))
              : `[Audio entry "${entry.name}" — transcription unavailable${result?.error ? `: ${result.error}` : ''}. The file itself is staged for upload.]`;
        } catch (err) {
          values[id] = `[Audio entry "${entry.name}" — transcription failed: ${err.message}. The file itself is staged for upload.]`;
        }
      } else if (entry.type === 'video') {
        values[id] = nativeMedia
          ? `[Video entry "${entry.name}" — the full video is attached to this result and will be processed natively by you.]`
          : `[Video entry "${entry.name}" — the user granted agent access. Video frames are not viewed as text in this runtime; the stored file is staged for upload via its uploadRef.]`;
      }
      continue;
    }

    if (!BIO_FIELD_MAP[id]) {
      notes.push(`${id}: unknown field`);
      continue;
    }
    values[id] = profile.fields[id] ?? null;
  }

  // Narrative text must be reworded per application (never pasted verbatim,
  // so two applications are not identical). Facts always stay exact.
  const REWORD_FIELDS = ['background', 'hobbyProjects', 'ideas'];
  const rewordBeforeUse = ids.filter(
    (id) =>
      REWORD_FIELDS.includes(String(id)) ||
      (String(id).startsWith('entry:') &&
        (profile.entries || []).some(
          (e) => `entry:${e.id}` === String(id) && e.type === 'document'
        ))
  );

  return JSON.stringify(
    {
      profileName: profile.name,
      values,
      ...(Object.keys(uploads).length ? { uploads } : {}),
      ...(rewordBeforeUse.length
        ? {
            rewordBeforeUse,
            rewordNote:
              'Rewrite these narrative fields in your own words, tailored to this specific role/company — never paste them word-for-word. Keep all factual data exact (names, email, phone, address, locations, dates, job titles, companies, URLs, skills keywords).'
          }
        : {}),
      ...(notes.length ? { notes } : {})
    },
    null,
    2
  );
}

/**
 * Collect media parts so the SELECTED MODEL does the processing natively:
 * images for every vision model; documents (PDF), audio and video inline for
 * models that accept them natively (Gemini family). For other models the
 * callers fall back to extraction (documents) and Meta transcription (audio).
 * Caps follow the model registry input limits.
 */
export async function collectBioMediaParts({ userId, fieldIds = [], model = '' } = {}) {
  const parts = [];
  if (!userId) return parts;
  const profile = getActiveProfile(userId);
  if (!profile) return parts;
  const nativeMedia = isNativeMediaModel(model);
  const ids = Array.isArray(fieldIds) ? fieldIds.map(String) : [];

  const addFilePart = (relPath, mime, maxBytes) => {
    if (parts.length >= 4) return;
    const abs = sandboxAbsPath(userId, relPath);
    if (!abs || !mime) return;
    try {
      const stat = fs.statSync(abs);
      if (stat.size > maxBytes) return;
      parts.push({
        inlineData: { mimeType: mime, data: fs.readFileSync(abs).toString('base64') }
      });
    } catch {}
  };

  const imageMimeFor = (relPath, hint) => {
    if (hint && hint.startsWith('image/')) return hint;
    const ext = path.extname(String(relPath || '')).toLowerCase();
    return (
      { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] ||
      'image/png'
    );
  };

  if (ids.includes('photo')) {
    addFilePart(profile.fields.photo || '', imageMimeFor(profile.fields.photo || '', ''), 5 * 1024 * 1024);
  }
  if (ids.includes('cv') && nativeMedia && profile.fields.cv?.path) {
    addFilePart(profile.fields.cv.path, 'application/pdf', 15 * 1024 * 1024);
  }

  for (const id of ids) {
    if (!id.startsWith('entry:')) continue;
    const entry = (profile.entries || []).find((e) => e.id === id.slice(6));
    if (!entry || !entry.file?.path) continue;
    if (entry.type === 'image') {
      addFilePart(entry.file.path, imageMimeFor(entry.file.path, entry.file.mime || ''), 5 * 1024 * 1024);
    } else if (!nativeMedia) {
      continue;
    } else if (entry.type === 'document') {
      addFilePart(entry.file.path, 'application/pdf', 15 * 1024 * 1024);
    } else if (entry.type === 'audio' && entry.agentReadable === true) {
      addFilePart(entry.file.path, entry.file.mime || 'audio/mpeg', 32 * 1024 * 1024);
    } else if (entry.type === 'video' && entry.agentReadable === true) {
      addFilePart(entry.file.path, entry.file.mime || 'video/mp4', 20 * 1024 * 1024);
    }
  }
  return parts;
}

/**
 * Resolve a BIO write proposal. The written value may ONLY come from a
 * stored user answer (answer_id) — never from model-produced text.
 */
export function resolveBioWrite({ userId, threadId, fieldId, answerId, profileId = null } = {}) {
  if (!userId) return { ok: false, error: 'BIO requires an identified user.' };
  const profile = getActiveProfile(userId);
  if (!profile) return { ok: false, error: 'No active BIO profile exists for this user.' };
  if (profileId && profileId !== profile.id) {
    return {
      ok: false,
      error: 'BIO access denied: the requested profile is not the active profile for this run.'
    };
  }
  const fieldDef = BIO_FIELD_MAP[String(fieldId || '')];
  if (!fieldDef) {
    return { ok: false, error: `Unknown BIO field: ${fieldId}. Use bio_index to list fields.` };
  }
  if (fieldDef.type === 'image' || fieldDef.type === 'file' || fieldDef.type === 'object') {
    return {
      ok: false,
      error: `Field "${fieldDef.label}" cannot be written from a text answer.`
    };
  }
  const answer = getBioAnswer(userId, threadId, answerId);
  if (!answer) {
    return {
      ok: false,
      error:
        'Unknown or expired answer_id. BIO writes may only come from a stored user answer (ask the user with ask_user first, then reference its answer ID). The write was NOT performed.'
    };
  }
  return {
    ok: true,
    profile,
    fieldDef,
    value: answer.answer,
    oldValue: profile.fields[fieldDef.id] ?? null
  };
}
