/**
 * redact-text.js
 *
 * Pure (no Node built-ins) text redaction helpers shared by the server
 * orchestrator and the browser UI, so raw BIO tool JSON and internal IDs
 * never render in the chat bubble — even while a reply is still streaming.
 */

/**
 * Strip raw BIO tool JSON blocks (e.g. an echoed bio_get result
 * `{"profileName": "...", "values": {...}}`) from chat text. Uses
 * string-aware brace matching so nested objects are removed in full.
 * An unterminated block (still streaming) is stripped to the end of text.
 */
export function stripRawBioJsonBlocks(text = '', replacement = 'Got your BIO.') {
  let out = String(text || '');
  if (!out) return '';
  const marker = /\{\s*"(?:profileName|profileId|values|uploads)"\s*:/g;
  let guard = 0;
  let m;
  while ((m = marker.exec(out)) !== null && guard++ < 50) {
    const start = m.index;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < out.length; i++) {
      const ch = out[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = end === -1 ? out.slice(start) : out.slice(start, end);
    // Only strip blocks that look like BIO payloads
    if (!/"(values|uploads|profileName)"\s*:/.test(block) && end !== -1) {
      marker.lastIndex = start + 1;
      continue;
    }
    // Also drop a surrounding ```json fence if present
    let s = start;
    let e = end === -1 ? out.length : end;
    const fenceOpen = out.slice(0, s).match(/```(?:json)?\s*$/i);
    if (fenceOpen) s -= fenceOpen[0].length;
    const fenceClose = out.slice(e).match(/^\s*```/);
    if (fenceClose) e += fenceClose[0].length;
    out = `${out.slice(0, s)}${replacement}${out.slice(e)}`;
    marker.lastIndex = s + replacement.length;
  }
  return out;
}

/**
 * Redact internal BIO/file/profile IDs from text.
 */
export function redactInternalIds(text = '') {
  return String(text || '')
    .replace(/\bentry:[a-zA-Z0-9_-]+\b/g, '[bio-entry]')
    .replace(/\bbiofile-[a-zA-Z0-9._-]+\b/g, '[staged-file]')
    .replace(/\bprofile-[a-f0-9-]{6,}\b/gi, '[active-profile]')
    .replace(/\banswer-[a-f0-9-]{6,}\b/gi, '[stored-answer]')
    .replace(/\bprop-[a-f0-9-]{6,}\b/gi, '[bio-proposal]');
}

/**
 * Chat-safe text: strip raw BIO JSON + internal IDs. Used for streamed chunks.
 */
export function sanitizeChatText(text = '') {
  return redactInternalIds(stripRawBioJsonBlocks(text));
}
