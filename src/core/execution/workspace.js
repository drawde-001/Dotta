import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { capToolOutput } from '../tools/policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getWorkspacesBaseDir() {
  const dir = path.resolve(__dirname, '../../workspaces');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getWorkspaceRoot(runId) {
  const safeRunId = String(runId || 'default-run').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.resolve(getWorkspacesBaseDir(), safeRunId);
}

export function createWorkspace(runId, name = '') {
  const workspaceRoot = getWorkspaceRoot(runId);
  if (!fs.existsSync(workspaceRoot)) {
    fs.mkdirSync(workspaceRoot, { recursive: true });
  }

  const metaPath = path.join(workspaceRoot, '.workspace.json');
  const metadata = {
    runId,
    name: name || runId,
    createdAt: Date.now(),
    workspaceRoot
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

  return {
    runId,
    name: metadata.name,
    workspaceRoot,
    created: true
  };
}

const SENSITIVE_FILE_REGEX = /(^\.env|\.env$|\.env\.|\.pem$|\.key$|^\.ssh$|[\\/]\.ssh[\\/]|id_rsa|id_ed25519)/i;

export function validateAndResolvePath(workspaceRoot, relativePath) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('Workspace root must be a valid path string');
  }

  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error('Path must be a non-empty string');
  }

  const raw = relativePath.trim();

  if (/[\x00-\x1f\x7f]/.test(raw)) {
    throw new Error(`Invalid or control characters in path: "${raw}"`);
  }

  if (/%2e|%2f|%5c/i.test(raw)) {
    throw new Error(`URL-encoded traversal sequences are strictly prohibited: "${raw}"`);
  }

  if (/^[\\/]{2}/.test(raw) || /\\\\[a-z0-9_.-]+\\/i.test(raw) || /^\\\\/i.test(raw) || /^\/\//i.test(raw)) {
    throw new Error(`UNC network paths are strictly prohibited: "${raw}"`);
  }

  if (path.isAbsolute(raw) || /^[a-zA-Z]:[/\\]/.test(raw) || /^[a-zA-Z]:$/i.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
    throw new Error(`Absolute paths are strictly prohibited: "${raw}". Paths must be relative to the workspace root.`);
  }

  if (raw === '..' || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(raw) || raw.includes('../') || raw.includes('..\\')) {
    throw new Error(`Path traversal ("..") is strictly prohibited: "${raw}"`);
  }

  if (SENSITIVE_FILE_REGEX.test(raw) || raw.includes('.ssh')) {
    throw new Error(`Access to sensitive credential file is strictly denied: "${raw}"`);
  }

  const normalizedRoot = path.normalize(path.resolve(workspaceRoot));
  const resolved = path.normalize(path.resolve(normalizedRoot, raw));

  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error(`Path traversal escapes workspace root: "${raw}"`);
  }

  const relFromRoot = path.relative(normalizedRoot, resolved);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    throw new Error(`Path traversal escapes workspace root: "${raw}"`);
  }

  if (fs.existsSync(resolved)) {
    try {
      const lstat = fs.lstatSync(resolved);
      if (lstat.isSymbolicLink()) {
        const realTarget = fs.realpathSync(resolved);
        const normReal = path.normalize(realTarget);
        if (normReal !== normalizedRoot && !normReal.startsWith(normalizedRoot + path.sep)) {
          throw new Error(`Symlink targets location outside workspace root: "${raw}" -> "${realTarget}"`);
        }
      }
    } catch (err) {
      if (err.message.includes('outside workspace root')) throw err;
    }
  }

  return resolved;
}

const filesReadByRun = new Map();

export function recordFileRead(runId, resolvedPath) {
  if (!runId) return;
  if (!filesReadByRun.has(runId)) {
    filesReadByRun.set(runId, new Set());
  }
  filesReadByRun.get(runId).add(resolvedPath);
}

export function hasFileBeenRead(runId, resolvedPath) {
  if (!runId) return false;
  const set = filesReadByRun.get(runId);
  return !!(set && set.has(resolvedPath));
}

export function clearRunReadTracker(runId) {
  if (runId) filesReadByRun.delete(runId);
}

function resolveEffectiveRoot({ workspaceRoot, runId }) {
  if (workspaceRoot && typeof workspaceRoot === 'string') {
    return workspaceRoot;
  }
  if (runId) {
    return getWorkspaceRoot(runId);
  }
  return path.resolve(process.cwd(), 'workspace');
}

export function workspaceFileRead({ path: relPath, runId, workspaceRoot, maxChars = 4000 }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  const resolved = validateAndResolvePath(effectiveRoot, relPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${relPath}"`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Path is a directory, not a file: "${relPath}". Use file_list to inspect directories.`);
  }

  const content = fs.readFileSync(resolved, 'utf8');
  recordFileRead(runId || 'default', resolved);

  return capToolOutput(content, maxChars);
}

export function workspaceFileList({ path: relPath = '.', recursive = false, workspaceRoot, runId, maxChars = 4000 }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  const resolved = validateAndResolvePath(effectiveRoot, relPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory not found: "${relPath}"`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is a file, not a directory: "${relPath}". Use file_read to read files.`);
  }

  function readDirRecursive(dir, currentRel = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let results = [];
    for (const ent of entries) {
      const entRel = currentRel ? `${currentRel}/${ent.name}` : ent.name;
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        results.push(`[DIR]  ${entRel}/`);
        if (recursive) {
          results = results.concat(readDirRecursive(fullPath, entRel));
        }
      } else {
        const sz = fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0;
        results.push(`[FILE] ${entRel} (${sz} bytes)`);
      }
    }
    return results;
  }

  const items = readDirRecursive(resolved);
  if (items.length === 0) {
    return `Directory "${relPath}" is empty.`;
  }
  return capToolOutput(items.join('\n'), maxChars);
}

export function workspaceFileSearch({ pattern, path: relPath = '.', workspaceRoot, runId, maxChars = 4000 }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  const resolved = validateAndResolvePath(effectiveRoot, relPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Search path not found: "${relPath}"`);
  }

  const query = String(pattern || '').toLowerCase();
  const matches = [];

  function walk(dir, currentRel = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const entRel = currentRel ? `${currentRel}/${ent.name}` : ent.name;
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.toLowerCase().includes(query)) {
          matches.push(`[DIR MATCH] ${entRel}/`);
        }
        walk(fullPath, entRel);
      } else if (ent.isFile()) {
        if (ent.name.toLowerCase().includes(query)) {
          matches.push(`[NAME MATCH] ${entRel}`);
        }
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.toLowerCase().includes(query)) {
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              if (line.toLowerCase().includes(query)) {
                matches.push(`[CONTENT MATCH] ${entRel}:${idx + 1}: ${line.trim().slice(0, 80)}`);
              }
            });
          }
        } catch {}
      }
    }
  }

  walk(resolved);
  if (matches.length === 0) {
    return `No matches found for "${pattern}" under "${relPath}".`;
  }
  return capToolOutput(matches.join('\n'), maxChars);
}

export function workspaceFileWrite({ path: relPath, content, workspaceRoot, runId }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  if (!fs.existsSync(effectiveRoot)) {
    fs.mkdirSync(effectiveRoot, { recursive: true });
  }

  const resolved = validateAndResolvePath(effectiveRoot, relPath);
  const parentDir = path.dirname(resolved);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const linesAdded = data.split(/\r\n|\r|\n/).length;
  fs.writeFileSync(resolved, data, 'utf8');

  return `Successfully wrote ${Buffer.byteLength(data, 'utf8')} bytes (+${linesAdded} lines) to "${relPath}".`;
}

export function workspaceFileEdit({ path: relPath, old_text, new_text, runId, workspaceRoot }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  const resolved = validateAndResolvePath(effectiveRoot, relPath);

  const trackerKey = runId || 'default';
  if (!hasFileBeenRead(trackerKey, resolved)) {
    throw new Error(`File "${relPath}" must be read with file_read earlier in this run before editing.`);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${relPath}"`);
  }

  if (typeof old_text !== 'string' || !old_text) {
    throw new Error('Parameter "old_text" must be a non-empty string');
  }
  const replacement = typeof new_text === 'string' ? new_text : '';

  const fileContent = fs.readFileSync(resolved, 'utf8');

  let count = 0;
  let pos = fileContent.indexOf(old_text);
  while (pos !== -1) {
    count++;
    pos = fileContent.indexOf(old_text, pos + old_text.length);
  }

  if (count === 0) {
    throw new Error(`Target old_text was not found in "${relPath}". Ensure the text matches exactly.`);
  }
  if (count > 1) {
    throw new Error(`Target old_text matched ${count} times in "${relPath}". It must match exactly once to edit safely.`);
  }

  const linesRemoved = old_text.split(/\r\n|\r|\n/).length;
  const linesAdded = replacement.split(/\r\n|\r|\n/).length;

  const newContent = fileContent.replace(old_text, replacement);
  fs.writeFileSync(resolved, newContent, 'utf8');

  return `Successfully edited "${relPath}" (+${linesAdded} -${linesRemoved}): replaced 1 exact match.`;
}

export function workspaceFileDelete({ path: relPath, runId, workspaceRoot }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  const resolved = validateAndResolvePath(effectiveRoot, relPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${relPath}"`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    fs.rmSync(resolved, { recursive: true, force: true });
    return `Successfully deleted directory "${relPath}".`;
  }

  fs.unlinkSync(resolved);
  return `Successfully deleted file "${relPath}".`;
}
