import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getRunSandbox } from '../execution/run-sandbox.js';

/**
 * Run-scoped staging registry for BIO files that the agent may upload to
 * forms. bio_get stages a permissible file and returns an opaque uploadRef;
 * when a RunSandbox is active, only the requested file is copied read-only
 * (0o444) into the sandbox's /inputs directory, and browser upload actions
 * use that read-only sandbox copy rather than the host BIO directory.
 * Refs never expose the path itself to the model or the page.
 */
const staged = new Map();
const MAX_AGE_MS = 1000 * 60 * 30;
let currentActiveRunId = null;

export function setActiveStagingRunId(runId) {
  currentActiveRunId = runId || null;
}

function prune() {
  const now = Date.now();
  for (const [token, item] of staged.entries()) {
    if (now - item.createdAt > MAX_AGE_MS) staged.delete(token);
  }
}

export function stageBioFile({ userId, absPath, name, mime, runId = null, fieldId = null }) {
  prune();
  const token = `biofile-${crypto.randomUUID().slice(0, 12)}`;
  const effectiveRunId = runId || currentActiveRunId;
  const sandbox = effectiveRunId ? getRunSandbox(effectiveRunId) : null;

  let sandboxCopy = null;
  if (sandbox && absPath && fs.existsSync(absPath)) {
    try {
      sandboxCopy = sandbox.stageBioFileReadOnly({
        token,
        absPath,
        name,
        mime,
        fieldId
      });
    } catch {}
  }

  staged.set(token, {
    token,
    userId: String(userId || ''),
    sourceAbsPath: String(absPath || ''),
    absPath: sandboxCopy ? sandboxCopy.sandboxPath : String(absPath || ''),
    sandboxPath: sandboxCopy ? sandboxCopy.sandboxPath : null,
    virtualPath: sandboxCopy ? sandboxCopy.virtualPath : null,
    readOnly: sandboxCopy ? true : false,
    name: String(name || 'file'),
    mime: String(mime || ''),
    fieldId: fieldId ? String(fieldId) : null,
    runId: effectiveRunId || null,
    createdAt: Date.now()
  });
  return token;
}

export function resolveStagedFile(token, runIdOrSandbox = null) {
  prune();
  if (!token || typeof token !== 'string') return null;
  const cleanToken = token.trim();
  let item = staged.get(cleanToken);

  if (!item) {
    const baseName = path.basename(cleanToken).toLowerCase();
    for (const cand of staged.values()) {
      if (
        cand.token === cleanToken ||
        cand.fieldId === cleanToken ||
        cand.name === cleanToken ||
        path.basename(cand.name).toLowerCase() === baseName ||
        (cand.fieldId && cleanToken.toLowerCase().includes(cand.fieldId.toLowerCase()))
      ) {
        item = cand;
        break;
      }
    }
  }

  const effectiveRunId = (typeof runIdOrSandbox === 'string' ? runIdOrSandbox : runIdOrSandbox?.runId) || currentActiveRunId || item?.runId;
  const sandbox = (runIdOrSandbox && typeof runIdOrSandbox === 'object' && runIdOrSandbox.inputsDir)
    ? runIdOrSandbox
    : (effectiveRunId ? getRunSandbox(effectiveRunId) : null);

  // If item was not in staged map, check if it exists directly in sandbox /inputs directory
  if (!item && sandbox && sandbox.inputsDir && fs.existsSync(sandbox.inputsDir)) {
    const baseName = path.basename(cleanToken);
    const directPath = path.join(sandbox.inputsDir, baseName);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
      item = {
        token: baseName,
        userId: 'sandbox',
        sourceAbsPath: directPath,
        absPath: directPath,
        sandboxPath: directPath,
        virtualPath: `/inputs/${baseName}`,
        readOnly: true,
        name: baseName,
        mime: '',
        fieldId: baseName,
        runId: effectiveRunId,
        createdAt: Date.now()
      };
      return item;
    }
  }

  if (!item) return null;

  if (sandbox && item.sourceAbsPath && fs.existsSync(item.sourceAbsPath)) {
    const existingInSandbox = sandbox.stagedFiles.get(item.token);
    if (existingInSandbox && fs.existsSync(existingInSandbox.sandboxPath)) {
      return {
        ...item,
        absPath: existingInSandbox.sandboxPath,
        sandboxPath: existingInSandbox.sandboxPath,
        virtualPath: existingInSandbox.virtualPath,
        readOnly: true
      };
    }
    try {
      const stagedCopy = sandbox.stageBioFileReadOnly({
        token: item.token,
        absPath: item.sourceAbsPath,
        name: item.name,
        mime: item.mime,
        fieldId: item.fieldId
      });
      return {
        ...item,
        absPath: stagedCopy.sandboxPath,
        sandboxPath: stagedCopy.sandboxPath,
        virtualPath: stagedCopy.virtualPath,
        readOnly: true
      };
    } catch {}
  }

  return item;
}

/**
 * Pre-stages all permissible files for an active profile into the run sandbox.
 */
export function stageProfileFilesForRun({ userId, profile, runSandbox, runId = null }) {
  if (!profile || !profile.fields) return [];
  const effectiveRunId = runId || runSandbox?.runId || currentActiveRunId;
  const stagedList = [];

  // Helper to resolve host file paths safely
  const resolveAbs = (relPath) => {
    if (!relPath || typeof relPath !== 'string') return null;
    if (path.isAbsolute(relPath) && fs.existsSync(relPath)) return relPath;
    const candidates = [
      path.resolve(process.cwd(), relPath),
      path.resolve(process.cwd(), 'src/data/bio', relPath),
      path.resolve(process.env.AGENT_BIO_DIR || '', relPath)
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  };

  // 1. Resume / CV
  const cv = profile.fields.cv;
  if (cv) {
    const cvPath = resolveAbs(cv.path) || resolveAbs('bio/seed-cv.pdf');
    if (cvPath) {
      const token = stageBioFile({
        userId,
        absPath: cvPath,
        name: cv.name || 'Alex_Morgan_CV_2026.pdf',
        mime: cv.mime || 'application/pdf',
        runId: effectiveRunId,
        fieldId: 'cv'
      });
      stagedList.push({ fieldId: 'cv', token, name: cv.name || 'Alex_Morgan_CV_2026.pdf', category: 'cv' });
    }
  }

  // 2. Photo / Headshot
  const photo = profile.fields.photo;
  if (photo) {
    const photoPath = resolveAbs(photo) || resolveAbs('bio/seed-photo.jpg');
    if (photoPath) {
      const token = stageBioFile({
        userId,
        absPath: photoPath,
        name: path.basename(photoPath),
        mime: 'image/jpeg',
        runId: effectiveRunId,
        fieldId: 'photo'
      });
      stagedList.push({ fieldId: 'photo', token, name: path.basename(photoPath), category: 'photo' });
    }
  }

  // 3. Entries
  for (const entry of (profile.entries || [])) {
    if (entry.file?.path) {
      const entryPath = resolveAbs(entry.file.path);
      if (entryPath) {
        const token = stageBioFile({
          userId,
          absPath: entryPath,
          name: entry.file.name || entry.name,
          mime: entry.file.mime || '',
          runId: effectiveRunId,
          fieldId: `entry:${entry.id}`
        });
        stagedList.push({
          fieldId: `entry:${entry.id}`,
          token,
          name: entry.file.name || entry.name,
          category: entry.type || 'document'
        });
      }
    }
  }

  return stagedList;
}

/**
 * Cross-checks a target file input against all available staged files in the sandbox.
 * Accurately determines whether the input expects a photo/headshot, resume/cv, audio sample, etc.,
 * and selects the matching file rather than uploading randomly or failing.
 */
export function findMatchingStagedFile({
  inputLabel = '',
  inputName = '',
  inputId = '',
  inputSelector = '',
  accept = '',
  requestedValue = '',
  runId = null,
  sandbox = null
} = {}) {
  const effectiveRunId = runId || sandbox?.runId || currentActiveRunId;
  const effectiveSandbox = (sandbox && sandbox.inputsDir) ? sandbox : (effectiveRunId ? getRunSandbox(effectiveRunId) : null);

  // 1. Determine expected file category of the input
  const textSignals = `${inputLabel} ${inputName} ${inputId} ${inputSelector}`.toLowerCase();
  const acceptLower = String(accept || '').toLowerCase();

  let expectedCategory = 'general';
  if (
    acceptLower.includes('image/') ||
    /\.(jpe?g|png|webp|gif|bmp|tiff)\b/i.test(acceptLower) ||
    /\b(photo|picture|headshot|portrait|avatar|face|look|comp[_\-\s]?card|image)\b/i.test(textSignals)
  ) {
    expectedCategory = 'photo';
  } else if (
    acceptLower.includes('application/pdf') ||
    /\.(pdf|docx?|rtf|txt)\b/i.test(acceptLower) ||
    /\b(resume|cv|curriculum|vitae|bio[_\-\s]?doc|portfolio[_\-\s]?doc|document|diploma|transcript)\b/i.test(textSignals)
  ) {
    expectedCategory = 'cv';
  } else if (
    acceptLower.includes('audio/') ||
    /\.(mp3|wav|m4a|aac|ogg|flac)\b/i.test(acceptLower) ||
    /\b(audio|voice|voiceover|vo\b|vocal|sound|demo|sample|recording)\b/i.test(textSignals)
  ) {
    expectedCategory = 'audio';
  } else if (
    acceptLower.includes('video/') ||
    /\.(mp4|mov|avi|webm|mkv)\b/i.test(acceptLower) ||
    /\b(video|reel|audition|self[_\-\s]?tape|tape|clip)\b/i.test(textSignals)
  ) {
    expectedCategory = 'video';
  }

  // 2. Gather candidate files
  const candidates = [];
  if (effectiveSandbox) {
    for (const record of effectiveSandbox.stagedFiles.values()) {
      candidates.push({
        token: record.token,
        name: record.name,
        mime: record.mime,
        fieldId: record.fieldId,
        absPath: record.sandboxPath,
        sandboxPath: record.sandboxPath
      });
    }
    // Also inspect files written directly to sandbox.inputsDir
    if (effectiveSandbox.inputsDir && fs.existsSync(effectiveSandbox.inputsDir)) {
      try {
        const filesOnDisk = fs.readdirSync(effectiveSandbox.inputsDir);
        for (const fname of filesOnDisk) {
          const fullPath = path.join(effectiveSandbox.inputsDir, fname);
          if (fs.statSync(fullPath).isFile()) {
            if (!candidates.some((c) => c.name === fname || c.absPath === fullPath)) {
              candidates.push({
                token: fname,
                name: fname,
                mime: '',
                fieldId: fname,
                absPath: fullPath,
                sandboxPath: fullPath,
                virtualPath: `/inputs/${fname}`
              });
            }
          }
        }
      } catch {}
    }
  }
  for (const item of staged.values()) {
    if (!effectiveRunId || item.runId === effectiveRunId || !item.runId) {
      if (!candidates.some((c) => c.token === item.token || c.name === item.name)) {
        candidates.push(item);
      }
    }
  }

  // Helper to categorize candidate file
  const getFileCategory = (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mime = String(file.mime || '').toLowerCase();
    const fid = String(file.fieldId || '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) || mime.startsWith('image/') || fid === 'photo') {
      return 'photo';
    }
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext) || mime === 'application/pdf' || fid === 'cv') {
      return 'cv';
    }
    if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext) || mime.startsWith('audio/') || fid.includes('audio') || fid.includes('voice')) {
      return 'audio';
    }
    if (['mp4', 'mov', 'webm'].includes(ext) || mime.startsWith('video/') || fid.includes('video')) {
      return 'video';
    }
    return 'general';
  };

  // Helper to check accept attribute matching
  const matchesAccept = (file) => {
    if (!acceptLower || acceptLower === '*' || acceptLower === '*/*') return true;
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    const mime = String(file.mime || '').toLowerCase();
    const tokens = acceptLower.split(',').map((t) => t.trim());
    return tokens.some((t) => {
      if (t === ext) return true;
      if (t === mime) return true;
      if (t.endsWith('/*') && mime.startsWith(t.slice(0, -1))) return true;
      return false;
    });
  };

  // 3. Evaluate requested value if provided
  if (requestedValue) {
    const direct = resolveStagedFile(requestedValue, effectiveSandbox || effectiveRunId);
    if (direct) {
      const directCat = getFileCategory(direct);
      const directAcceptMatch = matchesAccept(direct);
      if (expectedCategory === 'general' || directCat === expectedCategory || directAcceptMatch) {
        return {
          matchedFile: direct,
          expectedCategory,
          resolvedBy: 'exact_request',
          warning: null
        };
      }
      // If mismatch detected (e.g. input expects photo, but requested was cv),
      // search for the correct matching candidate in sandbox!
      const correctCandidate = candidates.find(
        (c) => getFileCategory(c) === expectedCategory && matchesAccept(c)
      );
      if (correctCandidate) {
        return {
          matchedFile: correctCandidate,
          expectedCategory,
          resolvedBy: 'smart_crosscheck',
          warning: `Cross-check: File input "${inputLabel || inputSelector}" expects ${expectedCategory} (${acceptLower || 'any'}), but provided file was "${direct.name}" (${directCat}). Automatically redirected to matching file "${correctCandidate.name}".`
        };
      }
    }
  }

  // 4. Auto-match by input category & accept constraint
  const categoryMatch = candidates.find(
    (c) => getFileCategory(c) === expectedCategory && matchesAccept(c)
  );
  if (categoryMatch) {
    return {
      matchedFile: categoryMatch,
      expectedCategory,
      resolvedBy: 'smart_crosscheck',
      warning: null
    };
  }

  // Fallback: any candidate matching accept
  const acceptMatch = candidates.find((c) => matchesAccept(c));
  if (acceptMatch) {
    return {
      matchedFile: acceptMatch,
      expectedCategory,
      resolvedBy: 'accept_fallback',
      warning: null
    };
  }

  // Fallback to first available file if any
  return {
    matchedFile: candidates[0] || null,
    expectedCategory,
    resolvedBy: candidates[0] ? 'first_available' : 'none',
    warning: candidates.length === 0 ? 'No staged BIO files available in sandbox' : null
  };
}


