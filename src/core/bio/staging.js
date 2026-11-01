import crypto from 'crypto';
import fs from 'fs';
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

export function resolveStagedFile(token, runId = null) {
  prune();
  if (!token || typeof token !== 'string') return null;
  const item = staged.get(token.trim());
  if (!item) return null;

  const effectiveRunId = runId || currentActiveRunId || item.runId;
  const sandbox = effectiveRunId ? getRunSandbox(effectiveRunId) : null;
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

