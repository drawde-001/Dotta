import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { capToolOutput } from '../tools/policy.js';
import { getRunSandbox, getOrCreateRunSandbox } from './run-sandbox.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const PROJECT_ROOT_NAME = path.basename(PROJECT_ROOT);

export function getWorkspacesBaseDir() {
  const dir = path.resolve(__dirname, '../../workspaces');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getWorkspaceRoot(runId) {
  const activeSandbox = runId ? getRunSandbox(runId) : null;
  if (activeSandbox) {
    return activeSandbox.workDir;
  }
  const sb = getOrCreateRunSandbox(runId || 'default-run');
  return sb.workDir;
}

/**
 * Per-user sandboxed workspace: one isolated folder per user ID under
 * workspaces/user-<userId>/. Users (and the agent acting for them) can only
 * ever see and touch files inside their own folder.
 */
export function sanitizeUserId(raw) {
  const id = String(raw || '').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) ? id : null;
}

export function getUserWorkspaceRoot(userId) {
  const safe = sanitizeUserId(userId);
  if (!safe) {
    throw new Error('Invalid user id');
  }
  const root = path.resolve(getWorkspacesBaseDir(), `user-${safe}`);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

export function listUserWorkspaceFiles(userId) {
  const root = getUserWorkspaceRoot(userId);
  const results = [];
  const MAX_ENTRIES = 500;
  const MAX_DEPTH = 6;

  function walk(dir, relBase, depth) {
    if (results.length >= MAX_ENTRIES || depth > MAX_DEPTH) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (results.length >= MAX_ENTRIES) return;
      if (ent.name === '.workspace.json' || ent.name.startsWith('.env') || ent.name === '.git') continue;
      if (SENSITIVE_FILE_REGEX.test(ent.name)) continue;
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, rel, depth + 1);
      } else if (ent.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {}
        results.push({ path: rel, name: ent.name, size });
      }
    }
  }

  walk(root, '', 0);
  return results;
}

export function readUserWorkspaceFile(userId, relativePath) {
  const root = getUserWorkspaceRoot(userId);
  const resolved = validateAndResolvePath(root, relativePath);
  const displayPath = sanitizeRelativeDisplayPath(relativePath, root);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${displayPath}"`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Path is a directory, not a file: "${displayPath}"`);
  }
  if (stat.size > 512000) {
    throw new Error(`File is too large to preview: "${displayPath}"`);
  }

  const content = redactRootPaths(fs.readFileSync(resolved, 'utf8'), root);
  return {
    name: path.basename(displayPath),
    path: displayPath,
    content
  };
}

/**
 * Strips any absolute host path, workspace root path, or root directory name
 * so neither the agent nor the user ever sees the name or location of the root directory.
 */
export function sanitizeRelativeDisplayPath(rawPath = '', effectiveRoot = '') {
  let clean = String(rawPath || '').trim().replace(/\\/g, '/');
  if (!clean) return '';

  const rootsToStrip = [
    effectiveRoot ? effectiveRoot.replace(/\\/g, '/') : '',
    PROJECT_ROOT.replace(/\\/g, '/'),
    getWorkspacesBaseDir().replace(/\\/g, '/'),
    '/home/ubuntu/omni-agent',
    '/app'
  ].filter(Boolean);

  for (const r of rootsToStrip) {
    if (clean.toLowerCase().startsWith(r.toLowerCase())) {
      clean = clean.slice(r.length);
    }
  }

  clean = clean.replace(/^[a-zA-Z]:\//, '').replace(/^\/+/, '').replace(/^\.\//, '');

  // Strip root folder name or internal run workspace folder prefixes if present
  const rootNameRegex = new RegExp(`^(?:${PROJECT_ROOT_NAME}|workspaces|workspace|run-[a-zA-Z0-9_.-]+|default-run)\\/+`, 'i');
  while (rootNameRegex.test(clean)) {
    clean = clean.replace(rootNameRegex, '');
  }

  return clean || 'file';
}

export function redactRootPaths(text = '', effectiveRoot = '') {
  if (typeof text !== 'string' || !text) return '';
  let out = text;
  const candidates = [
    effectiveRoot,
    effectiveRoot ? effectiveRoot.replace(/\\/g, '/') : '',
    PROJECT_ROOT,
    PROJECT_ROOT.replace(/\\/g, '/'),
    getWorkspacesBaseDir(),
    getWorkspacesBaseDir().replace(/\\/g, '/'),
    '/home/ubuntu/omni-agent',
    '/home/ubuntu',
    'C:\\Users\\USER\\Downloads\\omni-agent',
    'c:\\Users\\USER\\Downloads\\omni-agent',
    '/app'
  ].filter(Boolean);

  for (const cand of candidates) {
    out = out.split(cand).join('');
  }
  if (PROJECT_ROOT_NAME) {
    const rootWordRegex = new RegExp(`${PROJECT_ROOT_NAME}[\\\\/]`, 'gi');
    out = out.replace(rootWordRegex, '');
  }
  return out;
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
    createdAt: Date.now()
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

  // Never expose workspaceRoot location or root directory name
  return {
    runId,
    name: metadata.name,
    created: true
  };
}

const SENSITIVE_FILE_REGEX = /(^\.env|\.env$|\.env\.|\.pem$|\.key$|^\.ssh$|[\\/]\.ssh[\\/]|id_rsa|id_ed25519|^\.git$|[\\/]\.git[\\/]|^\.agents|[\\/]\.agents|others[\\/])/i;

export function validateAndResolvePath(workspaceRoot, relativePath) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('Workspace must be initialized');
  }

  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error('Path must be a non-empty string');
  }

  let raw = relativePath.trim();

  if (/[\x00-\x1f\x7f]/.test(raw)) {
    throw new Error('Invalid or control characters in path');
  }

  if (/%2e|%2f|%5c/i.test(raw)) {
    throw new Error('URL-encoded traversal sequences are strictly prohibited');
  }

  if (/^[\\/]{2}/.test(raw) || /\\\\[a-z0-9_.-]+\\/i.test(raw) || /^\\\\/i.test(raw) || /^\/\//i.test(raw)) {
    throw new Error('UNC network paths are strictly prohibited');
  }

  if (path.isAbsolute(raw) || /^[a-zA-Z]:[/\\]/.test(raw) || /^[a-zA-Z]:$/i.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
    throw new Error('Access to root or absolute paths is strictly prohibited. Paths must be relative within the workspace.');
  }

  if (raw === '..' || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(raw) || raw.includes('../') || raw.includes('..\\')) {
    throw new Error('Path traversal ("..") is strictly prohibited');
  }

  // Strip root folder prefix if the model prefixed it (e.g. "omni-agent/src/...")
  const rootPrefixRegex = new RegExp(`^${PROJECT_ROOT_NAME}[\\\\/]+`, 'i');
  if (rootPrefixRegex.test(raw)) {
    raw = raw.replace(rootPrefixRegex, '');
  }

  if (SENSITIVE_FILE_REGEX.test(raw) || raw.includes('.ssh')) {
    throw new Error(`Access to sensitive credential or restricted file is strictly denied: "${sanitizeRelativeDisplayPath(raw)}"`);
  }

  const normalizedRoot = path.normalize(path.resolve(workspaceRoot));
  const normalizedProjectRoot = path.normalize(PROJECT_ROOT);
  if (normalizedRoot.toLowerCase() === normalizedProjectRoot.toLowerCase()) {
    throw new Error('Access to the host project root workspace is strictly prohibited.');
  }

  const resolved = path.normalize(path.resolve(normalizedRoot, raw));

  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new Error('Path traversal escapes workspace boundaries');
  }

  const relFromRoot = path.relative(normalizedRoot, resolved);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    throw new Error('Path traversal escapes workspace boundaries');
  }

  if (fs.existsSync(resolved)) {
    try {
      const lstat = fs.lstatSync(resolved);
      if (lstat.isSymbolicLink()) {
        const realTarget = fs.realpathSync(resolved);
        const normReal = path.normalize(realTarget);
        if (normReal !== normalizedRoot && !normReal.startsWith(normalizedRoot + path.sep)) {
          throw new Error('Symlink targets location outside workspace boundaries');
        }
      }
    } catch (err) {
      if (err.message.includes('outside workspace')) throw err;
    }
  }

  return resolved;
}

const filesReadByRun = new Map();
const latestFileArtifactsByRun = new Map();

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
  if (runId) {
    filesReadByRun.delete(runId);
    latestFileArtifactsByRun.delete(runId);
  }
}

export function recordFileArtifact(runId, artifact) {
  const key = runId || 'default';
  if (!latestFileArtifactsByRun.has(key)) {
    latestFileArtifactsByRun.set(key, []);
  }
  const list = latestFileArtifactsByRun.get(key);
  list.push({
    ...artifact,
    path: sanitizeRelativeDisplayPath(artifact.path),
    timestamp: Date.now()
  });
}

export function getLatestFileArtifact(runId) {
  const key = runId || 'default';
  const list = latestFileArtifactsByRun.get(key);
  if (!list || list.length === 0) return null;
  return list[list.length - 1];
}

function resolveEffectiveRoot({ workspaceRoot, runId }) {
  // If an isolated RunSandbox is active for this runId, always confine agent file operations to it
  if (runId) {
    const activeSandbox = getRunSandbox(runId);
    if (activeSandbox) {
      return activeSandbox.workDir;
    }
  }
  if (workspaceRoot && typeof workspaceRoot === 'string') {
    const normWs = path.normalize(path.resolve(workspaceRoot)).toLowerCase();
    const normProject = path.normalize(PROJECT_ROOT).toLowerCase();
    const normWorkspacesBase = path.normalize(getWorkspacesBaseDir()).toLowerCase();
    // Never allow agent run tools to mount the project root or the BIO storage root directly
    if (normWs === normProject || normWs.startsWith(normWorkspacesBase)) {
      return getWorkspaceRoot(runId || 'default-run');
    }
    return workspaceRoot;
  }
  return getWorkspaceRoot(runId || 'default-run');
}

export function workspaceFileRead({ path: relPath, runId, workspaceRoot, maxChars = 4000 }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  const resolved = validateAndResolvePath(effectiveRoot, relPath);
  const displayPath = sanitizeRelativeDisplayPath(relPath, effectiveRoot);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${displayPath}"`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Path is a directory, not a file: "${displayPath}". Use file_list to inspect directories.`);
  }

  const rawContent = fs.readFileSync(resolved, 'utf8');
  const redactedContent = redactRootPaths(rawContent, effectiveRoot);
  recordFileRead(runId || 'default', resolved);

  recordFileArtifact(runId || 'default', {
    path: displayPath,
    name: path.basename(displayPath),
    action: 'viewed',
    content: redactedContent,
    startLine: 1
  });

  return capToolOutput(redactedContent, maxChars);
}

export function workspaceFileList({ path: relPath = '.', recursive = false, workspaceRoot, runId, maxChars = 4000 }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  if (!fs.existsSync(effectiveRoot)) {
    fs.mkdirSync(effectiveRoot, { recursive: true });
  }
  const resolved = validateAndResolvePath(effectiveRoot, relPath);
  const displayPath = sanitizeRelativeDisplayPath(relPath === '.' ? 'workspace' : relPath, effectiveRoot);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory not found: "${displayPath}"`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is a file, not a directory: "${displayPath}". Use file_read to read files.`);
  }

  function readDirRecursive(dir, currentRel = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let results = [];
    for (const ent of entries) {
      if (ent.name === '.workspace.json' || ent.name.startsWith('.env') || ent.name === '.git') continue;
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
    return 'Workspace directory is empty.';
  }
  return capToolOutput(items.join('\n'), maxChars);
}

export function workspaceFileSearch({ pattern, path: relPath = '.', workspaceRoot, runId, maxChars = 4000 }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  if (!fs.existsSync(effectiveRoot)) {
    fs.mkdirSync(effectiveRoot, { recursive: true });
  }
  const resolved = validateAndResolvePath(effectiveRoot, relPath);
  const displayPath = sanitizeRelativeDisplayPath(relPath, effectiveRoot);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Search path not found: "${displayPath}"`);
  }

  const query = String(pattern || '').toLowerCase();
  const matches = [];

  function walk(dir, currentRel = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === '.workspace.json' || ent.name.startsWith('.env') || ent.name === '.git') continue;
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
          const content = redactRootPaths(fs.readFileSync(fullPath, 'utf8'), effectiveRoot);
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
    return `No matches found for "${pattern}".`;
  }
  return capToolOutput(matches.join('\n'), maxChars);
}

export function workspaceFileWrite({ path: relPath, content, workspaceRoot, runId }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  if (!fs.existsSync(effectiveRoot)) {
    fs.mkdirSync(effectiveRoot, { recursive: true });
  }

  const resolved = validateAndResolvePath(effectiveRoot, relPath);
  const displayPath = sanitizeRelativeDisplayPath(relPath, effectiveRoot);
  const parentDir = path.dirname(resolved);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const redactedData = redactRootPaths(data, effectiveRoot);
  const linesAdded = redactedData.split(/\r\n|\r|\n/).length;
  fs.writeFileSync(resolved, redactedData, 'utf8');
  recordFileRead(runId || 'default', resolved);

  recordFileArtifact(runId || 'default', {
    path: displayPath,
    name: path.basename(displayPath),
    action: 'created',
    content: redactedData,
    newText: redactedData,
    editStartLine: 1,
    editEndLine: linesAdded,
    linesAdded,
    linesRemoved: 0
  });

  return `Successfully wrote ${Buffer.byteLength(redactedData, 'utf8')} bytes (+${linesAdded} lines) to "${displayPath}".`;
}

export function workspaceFileEdit({ path: relPath, old_text, new_text, runId, workspaceRoot }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  const resolved = validateAndResolvePath(effectiveRoot, relPath);
  const displayPath = sanitizeRelativeDisplayPath(relPath, effectiveRoot);

  const trackerKey = runId || 'default';
  if (!hasFileBeenRead(trackerKey, resolved)) {
    throw new Error(`File "${displayPath}" must be read with file_read earlier in this run before editing.`);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${displayPath}"`);
  }

  if (typeof old_text !== 'string' || !old_text) {
    throw new Error('Parameter "old_text" must be a non-empty string');
  }
  const replacement = typeof new_text === 'string' ? new_text : '';

  const fileContent = fs.readFileSync(resolved, 'utf8');

  let count = 0;
  let pos = fileContent.indexOf(old_text);
  let firstMatchPos = pos;
  while (pos !== -1) {
    count++;
    pos = fileContent.indexOf(old_text, pos + old_text.length);
  }

  if (count === 0) {
    throw new Error(`Target old_text was not found in "${displayPath}". Ensure the text matches exactly.`);
  }
  if (count > 1) {
    throw new Error(`Target old_text matched ${count} times in "${displayPath}". It must match exactly once to edit safely.`);
  }

  const prefixBeforeEdit = fileContent.slice(0, firstMatchPos);
  const editStartLine = prefixBeforeEdit.split(/\r\n|\r|\n/).length;
  const linesRemoved = old_text.split(/\r\n|\r|\n/).length;
  const linesAdded = replacement.split(/\r\n|\r|\n/).length;
  const editEndLine = editStartLine + Math.max(1, linesAdded) - 1;

  const newContent = redactRootPaths(fileContent.replace(old_text, replacement), effectiveRoot);
  fs.writeFileSync(resolved, newContent, 'utf8');

  recordFileArtifact(runId || 'default', {
    path: displayPath,
    name: path.basename(displayPath),
    action: 'single edit',
    content: newContent,
    oldText: redactRootPaths(old_text, effectiveRoot),
    newText: redactRootPaths(replacement, effectiveRoot),
    editStartLine,
    editEndLine,
    linesAdded,
    linesRemoved
  });

  return `Successfully edited "${displayPath}" (+${linesAdded} -${linesRemoved}): replaced 1 exact match.`;
}

export function workspaceFileDelete({ path: relPath, runId, workspaceRoot }) {
  const effectiveRoot = resolveEffectiveRoot({ workspaceRoot, runId });
  const resolved = validateAndResolvePath(effectiveRoot, relPath);
  const displayPath = sanitizeRelativeDisplayPath(relPath, effectiveRoot);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${displayPath}"`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    fs.rmSync(resolved, { recursive: true, force: true });
    return `Successfully deleted directory "${displayPath}".`;
  }

  fs.unlinkSync(resolved);
  recordFileArtifact(runId || 'default', {
    path: displayPath,
    name: path.basename(displayPath),
    action: 'deleted',
    content: '',
    startLine: 1
  });
  return `Successfully deleted file "${displayPath}".`;
}
