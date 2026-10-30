import {
  BIO_FIELDS,
  BIO_FIELD_MAP,
  getActiveProfile,
  getBioAnswer
} from './store.js';

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

function entryReadable(entry) {
  if (entry.type === 'document') return true;
  // Audio/video need a tailored, per-entry grant from the user — the general
  // BIO read switch alone never exposes them.
  if (entry.type === 'audio' || entry.type === 'video') return entry.agentReadable === true;
  return false;
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
 * A profile_id that is not the active profile is denied.
 */
export function executeBioGet({ userId, fieldIds = [], profileId = null } = {}) {
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
  const notes = [];
  for (const rawId of ids.slice(0, 20)) {
    const id = String(rawId || '');
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
            : `[Stored ${entry.type} entry "${entry.name}". Image content is not returned as text.]`;
        continue;
      }
      if (entry.type === 'document') {
        values[id] = entry.textContent
          ? entry.textContent
          : `[Document "${entry.name}" is stored${entry.file?.name ? ` as ${entry.file.name}` : ''} but has no extractable text.]`;
      } else {
        values[id] = `[${entry.type} entry "${entry.name}" — the user granted agent access to this entry. Stored file: ${entry.file?.name || 'none'}${entry.file?.mime ? ` (${entry.file.mime})` : ''}. Media bytes are not inlined as text.]`;
      }
      continue;
    }
    if (!BIO_FIELD_MAP[id]) {
      notes.push(`${id}: unknown field`);
      continue;
    }
    values[id] = profile.fields[id] ?? null;
  }
  return JSON.stringify(
    { profileName: profile.name, values, ...(notes.length ? { notes } : {}) },
    null,
    2
  );
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
