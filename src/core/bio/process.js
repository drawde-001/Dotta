import fs from 'fs';
import path from 'path';
import { getActiveProfile } from './store.js';
import { getUserWorkspaceRoot, validateAndResolvePath } from '../execution/workspace.js';
import {
  transcribeSingleAudioChunk,
  formatMediaForSelectedModel,
  getSameFamilyModelCandidates
} from '../media/media-processor.js';
import { stageBioFile } from './staging.js';
import { extractFileText, isNativeMediaModel } from './executors.js';
import { wrapUntrustedContent } from '../tools/untrusted.js';

/**
 * Dedicated BIO file processors. The agent must run the matching processor
 * and CONFIRM a file (right person, right document, relevant content) before
 * using it. Results flow back to the agent so it can continue. Permissions:
 * BIO read grant for documents/images; tailored per-entry grant for
 * audio/video. Files are also staged for form upload (uploadRef).
 */

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

function resolveBioFileRef(userId, ref) {
  const profile = getActiveProfile(userId);
  if (!profile) return { error: 'No active BIO profile exists for this user.' };
  if (!profile.grants?.read) {
    return {
      error:
        'BIO read access is off. Do NOT use ask_user for this. Politely ask the user in plain text to grant BIO read access (BIO page, Agent Access, Read switch) or to provide the file another way.'
    };
  }
  const key = String(ref || '').trim();
  if (!key) return { error: 'A BIO file reference is required (e.g. "cv", "photo", or "entry:<id>" from bio_index).' };

  if (key === 'cv') {
    const cv = profile.fields.cv;
    if (!cv?.name) return { error: 'No CV is stored in BIO yet.' };
    return {
      profile,
      kind: 'document',
      fieldId: 'cv',
      name: cv.name,
      mime: cv.mime || '',
      relPath: cv.path || '',
      entry: null
    };
  }
  if (key === 'photo') {
    const rel = profile.fields.photo || '';
    if (!rel) return { error: 'No profile photo is stored in BIO yet.' };
    return {
      profile,
      kind: 'image',
      fieldId: 'photo',
      name: path.basename(rel),
      mime: '',
      relPath: rel,
      entry: null
    };
  }
  if (key.startsWith('entry:')) {
    const entry = (profile.entries || []).find((e) => e.id === key.slice(6));
    if (!entry) return { error: `BIO entry not found: ${key}` };
    return {
      profile,
      kind: entry.type,
      fieldId: key,
      name: entry.file?.name || entry.name,
      mime: entry.file?.mime || '',
      relPath: entry.file?.path || '',
      entry
    };
  }
  return { error: `Unknown BIO file reference: ${key}. Use "cv", "photo", or "entry:<id>" from bio_index.` };
}

function stage(resolved, userId) {
  const abs = sandboxAbsPath(userId, resolved.relPath);
  if (!abs) return { abs: null, uploadRef: null };
  return {
    abs,
    uploadRef: stageBioFile({ userId, absPath: abs, name: resolved.name, mime: resolved.mime })
  };
}

export async function processDocument({ userId, ref, model = '' } = {}) {
  if (!userId) return 'Error: BIO requires an identified user.';
  let resolved = resolveBioFileRef(userId, ref);
  let abs = null;
  let uploadRef = null;

  if (resolved.error) {
    abs = sandboxAbsPath(userId, ref);
    if (abs && fs.existsSync(abs)) {
      const ext = path.extname(abs).toLowerCase();
      const mime = ext === '.pdf' ? 'application/pdf' : 'text/plain';
      resolved = {
        name: path.basename(abs),
        mime,
        relPath: ref,
        kind: 'document'
      };
      uploadRef = stageBioFile({ userId, absPath: abs, name: resolved.name, mime });
    } else {
      return `Error: ${resolved.error}`;
    }
  } else {
    if (resolved.kind !== 'document' && resolved.fieldId !== 'cv') {
      return `Error: "${resolved.name}" is not a document. Use the matching processor for its type.`;
    }
    const staged = stage(resolved, userId);
    abs = staged.abs;
    uploadRef = staged.uploadRef;
  }

  if (!abs) return `Error: The document "${resolved.name}" has no readable file attached in BIO or workspace. Politely tell the user and recommend re-uploading it or providing another file.`;
  const familyInfo = getSameFamilyModelCandidates(model || 'muse-spark-open');
  if (isNativeMediaModel(model) && /\.pdf$/i.test(resolved.name || '')) {
    return `[Document "${resolved.name}" will be processed natively by you (${familyInfo.selectedModel}, family: ${familyInfo.family}) — the full file is attached to this result. Confirm it matches the current task before using it. uploadRef: ${uploadRef || 'unavailable'}]`;
  }

  // Conversion file format route: extract raw text from PDF/DOCX/TXT
  let text = resolved.entry?.textContent || '';
  if (!text) {
    try {
      text = await extractFileText(abs, resolved.mime, resolved.name);
    } catch {}
  }

  // If conversion route failed, fallback to other family models
  if (!text && familyInfo.models.length > 1) {
    for (const candModel of familyInfo.models) {
      if (candModel === model) continue;
      try {
        text = await extractFileText(abs, resolved.mime, resolved.name).catch(() => '');
        if (text) break;
      } catch {}
    }
  }

  if (!text) {
    return `Could not extract text from "${resolved.name}". Politely tell the user the document could not be processed and recommend uploading a text-based PDF/DOCX/TXT or pasting the content. (uploadRef: ${uploadRef || 'unavailable'})`;
  }
  return `[Processed document "${resolved.name}" via selected model ${familyInfo.selectedModel} (family: ${familyInfo.family}, same-family fallback: ${familyInfo.models.slice(0, 4).join(' -> ')}) — confirm it matches the current task before using it. uploadRef: ${uploadRef || 'unavailable'}]\n\n${wrapUntrustedContent('bio-document', text)}`;
}

export async function processImage({ userId, ref, model = '' } = {}) {
  if (!userId) return 'Error: BIO requires an identified user.';
  let resolved = resolveBioFileRef(userId, ref);
  let abs = null;
  let uploadRef = null;

  if (resolved.error) {
    abs = sandboxAbsPath(userId, ref);
    if (abs && fs.existsSync(abs)) {
      const ext = path.extname(abs).toLowerCase();
      const mime =
        { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] ||
        'image/png';
      resolved = {
        name: path.basename(abs),
        mime,
        relPath: ref,
        kind: 'image'
      };
      uploadRef = stageBioFile({ userId, absPath: abs, name: resolved.name, mime });
    } else {
      return `Error: ${resolved.error}`;
    }
  } else {
    if (resolved.kind !== 'image' && resolved.fieldId !== 'photo') {
      return `Error: "${resolved.name}" is not an image. Use the matching processor for its type.`;
    }
    const staged = stage(resolved, userId);
    abs = staged.abs;
    uploadRef = staged.uploadRef;
  }

  if (!abs) return `Error: The image "${resolved.name}" has no readable file attached in BIO or workspace. Politely tell the user and recommend re-uploading it or providing another image.`;
  const buf = fs.readFileSync(abs);
  const size = buf.length;
  const formatted = formatMediaForSelectedModel({
    buffer: buf,
    mimeType: resolved.mime || 'image/png',
    filename: resolved.name,
    selectedModel: model || 'muse-spark-open'
  });
  return `[Processed image "${resolved.name}" (${size} bytes, formatted as ${formatted.providerFormat} for ${formatted.selectedModel}, family: ${formatted.family}, same-family fallback: ${formatted.candidateModels.slice(0, 4).join(' -> ')}) — the image itself is attached to this result for viewing. Confirm it is the right image for the current task before using it. uploadRef: ${uploadRef || 'unavailable'}]`;
}

export async function processAudio({ userId, ref, model = '' } = {}) {
  if (!userId) return 'Error: BIO requires an identified user.';
  let resolved = resolveBioFileRef(userId, ref);
  let abs = null;
  let uploadRef = null;

  if (resolved.error) {
    abs = sandboxAbsPath(userId, ref);
    if (abs && fs.existsSync(abs)) {
      const ext = path.extname(abs).toLowerCase();
      const mime =
        { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.flac': 'audio/flac' }[ext] ||
        'audio/wav';
      resolved = {
        name: path.basename(abs),
        mime,
        relPath: ref,
        kind: 'audio'
      };
      uploadRef = stageBioFile({ userId, absPath: abs, name: resolved.name, mime });
    } else {
      return `Error: ${resolved.error}`;
    }
  } else {
    if (resolved.kind !== 'audio') {
      return `Error: "${resolved.name}" is not an audio entry. Use the matching processor for its type.`;
    }
    if (resolved.entry && resolved.entry.agentReadable !== true) {
      return `Error: The user has not granted agent access to audio entry "${resolved.entry.name}". Do NOT use ask_user for this. Politely ask the user in plain text to grant access on that entry (BIO page, Additional bio) or to provide the information another way.`;
    }
    const staged = stage(resolved, userId);
    abs = staged.abs;
    uploadRef = staged.uploadRef;
  }

  if (!abs) return `Error: The audio "${resolved.name}" has no readable file attached in BIO or workspace. Politely tell the user and recommend re-uploading it or providing another file.`;

  const familyInfo = getSameFamilyModelCandidates(model || 'muse-spark-open');
  if (isNativeMediaModel(model)) {
    return `[Audio "${resolved.name}" will be processed natively by you (${familyInfo.selectedModel}, family: ${familyInfo.family}) — the full audio is attached to this result. Confirm it matches the current task before using it. uploadRef: ${uploadRef || 'unavailable'}]`;
  }

  try {
    const result = await transcribeSingleAudioChunk(
      {
        buffer: fs.readFileSync(abs),
        mimeType: resolved.mime || 'audio/mpeg',
        filename: resolved.name
      },
      { preferredModel: model || 'muse-spark-open' }
    );
    if (result?.ok && result.text) {
      return `[Transcribed audio "${resolved.name}" via ${result.source || familyInfo.selectedModel} (family: ${familyInfo.family}) — confirm the content matches the current task before using it. uploadRef: ${uploadRef || 'unavailable'}]\n\n${wrapUntrustedContent('audio-transcript', String(result.text).slice(0, 8000))}`;
    }
    return `Could not transcribe audio "${resolved.name}"${result?.error ? `: ${result.error}` : ''}. Politely tell the user transcription failed and recommend re-uploading the audio or providing the content as text. (uploadRef: ${uploadRef || 'unavailable'})`;
  } catch (err) {
    return `Could not transcribe audio "${resolved.name}": ${err.message}. Politely tell the user and recommend the next step. (uploadRef: ${uploadRef || 'unavailable'})`;
  }
}

export async function processVideo({ userId, ref, model = '' } = {}) {
  if (!userId) return 'Error: BIO requires an identified user.';
  let resolved = resolveBioFileRef(userId, ref);
  let abs = null;
  let uploadRef = null;

  if (resolved.error) {
    abs = sandboxAbsPath(userId, ref);
    if (abs && fs.existsSync(abs)) {
      const ext = path.extname(abs).toLowerCase();
      const mime = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' }[ext] || 'video/mp4';
      resolved = {
        name: path.basename(abs),
        mime,
        relPath: ref,
        kind: 'video'
      };
      uploadRef = stageBioFile({ userId, absPath: abs, name: resolved.name, mime });
    } else {
      return `Error: ${resolved.error}`;
    }
  } else {
    if (resolved.kind !== 'video') {
      return `Error: "${resolved.name}" is not a video entry. Use the matching processor for its type.`;
    }
    if (resolved.entry && resolved.entry.agentReadable !== true) {
      return `Error: The user has not granted agent access to video entry "${resolved.entry.name}". Do NOT use ask_user for this. Politely ask the user in plain text to grant access on that entry (BIO page, Additional bio) or to provide the information another way.`;
    }
    const staged = stage(resolved, userId);
    abs = staged.abs;
    uploadRef = staged.uploadRef;
  }

  if (!abs) return `Error: The video "${resolved.name}" has no readable file attached in BIO or workspace. Politely tell the user and recommend re-uploading it or providing another file.`;
  const size = fs.statSync(abs).size;
  const familyInfo = getSameFamilyModelCandidates(model || 'muse-spark-open');
  if (isNativeMediaModel(model)) {
    return `[Video "${resolved.name}" (${size} bytes) will be processed natively by you (${familyInfo.selectedModel}, family: ${familyInfo.family}) — the full video is attached to this result. Confirm it matches the current task before using it. uploadRef: ${uploadRef || 'unavailable'}]`;
  }

  // Conversion file format route: extract audio dialogue and spoken content from video buffer
  let videoContent = resolved.entry?.textContent || '';
  try {
    const videoBuf = fs.readFileSync(abs);
    const transcribeRes = await transcribeSingleAudioChunk(
      {
        buffer: videoBuf,
        mimeType: resolved.mime || 'video/mp4',
        filename: resolved.name
      },
      { preferredModel: model || 'muse-spark-open' }
    );
    if (transcribeRes?.ok && transcribeRes.text) {
      videoContent = transcribeRes.text;
    }
  } catch {}

  // If conversion route failed, fallback to other family models
  if (!videoContent && familyInfo.models.length > 1) {
    for (const candModel of familyInfo.models) {
      if (candModel === model) continue;
      try {
        const fallbackRes = await transcribeSingleAudioChunk(
          {
            buffer: fs.readFileSync(abs),
            mimeType: resolved.mime || 'video/mp4',
            filename: resolved.name
          },
          { preferredModel: candModel }
        );
        if (fallbackRes?.ok && fallbackRes.text) {
          videoContent = fallbackRes.text;
          break;
        }
      } catch {}
    }
  }

  const contentNote = videoContent
    ? `\n\n**Extracted Video Spoken Dialogue / Audio Content**:\n${wrapUntrustedContent('video-content', videoContent)}`
    : `\n\n**Video Content Summary**: "${resolved.entry?.description || resolved.name}" (Visual/Speech reel).`;

  return `[Processed video "${resolved.name}" (${size} bytes, ${resolved.mime || 'video'}, model: ${familyInfo.selectedModel}, family: ${familyInfo.family}, same-family fallback: ${familyInfo.models.slice(0, 4).join(' -> ')}). Analyze the content below to confirm this is the right video for the form requirements before uploading. uploadRef: ${uploadRef || 'unavailable'}]${contentNote}`;
}
