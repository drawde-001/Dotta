import crypto from 'crypto';

/**
 * Run-scoped staging registry for BIO files that the agent may upload to
 * forms. bio_get stages a permissible file and returns an opaque uploadRef;
 * the browser upload action resolves the ref to the real sandbox path.
 * Refs never expose the path itself to the model or the page.
 */
const staged = new Map();
const MAX_AGE_MS = 1000 * 60 * 30;

function prune() {
  const now = Date.now();
  for (const [token, item] of staged.entries()) {
    if (now - item.createdAt > MAX_AGE_MS) staged.delete(token);
  }
}

export function stageBioFile({ userId, absPath, name, mime }) {
  prune();
  const token = `biofile-${crypto.randomUUID().slice(0, 12)}`;
  staged.set(token, {
    userId: String(userId || ''),
    absPath: String(absPath || ''),
    name: String(name || 'file'),
    mime: String(mime || ''),
    createdAt: Date.now()
  });
  return token;
}

export function resolveStagedFile(token) {
  prune();
  if (!token || typeof token !== 'string') return null;
  return staged.get(token.trim()) || null;
}
