/**
 * src/core/auth/access-control.js
 *
 * Central Server-Side Ownership Enforcement, Timing Attack Defense,
 * Miss Rate-Limiting, and Signed Download Security.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getUserThread, getDataDir } from '../state/store.js';
import { getDbConversation, logDbAudit, getSupabaseClient } from '../db/supabase.js';
import { loadUserBio } from '../bio/store.js';
import { getUserWorkspaceRoot, validateAndResolvePath } from '../execution/workspace.js';

// Sliding window for tracking 404 / unauthorized misses per key (ip or userId)
const missTracker = new Map();
const MISS_WINDOW_MS = 60 * 1000;
const MAX_MISSES_PER_WINDOW = 20;

/**
 * Record a miss (404/not found/denied) and check if rate limited.
 */
export function recordMissAndCheckRateLimit(identifier) {
  const now = Date.now();
  const key = String(identifier || 'unknown');
  let entry = missTracker.get(key);

  if (!entry || now - entry.resetAt > MISS_WINDOW_MS) {
    entry = { count: 1, resetAt: now };
    missTracker.set(key, entry);
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_MISSES_PER_WINDOW;
}

/**
 * Clean up old miss tracker entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of missTracker.entries()) {
    if (now - entry.resetAt > MISS_WINDOW_MS) {
      missTracker.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Central Resource Ownership Assertion.
 * Returns true if the resource exists AND is owned by the user.
 * Returns false if the resource does not exist OR is owned by another user.
 */
export async function assertResourceOwnership(resourceType, resourceId, userId) {
  if (!resourceType || !resourceId || !userId) return false;

  const cleanUserId = String(userId);
  const cleanResourceId = String(resourceId);

  switch (resourceType) {
    case 'thread': {
      // 1. Check local user-scoped thread store
      const localThread = getUserThread(cleanUserId, cleanResourceId);
      if (localThread) {
        if (localThread.userId && localThread.userId !== cleanUserId) {
          return false;
        }
        return true;
      }

      // 2. Check Supabase conversations table with strict user_id equality
      try {
        const dbThread = await getDbConversation(cleanUserId, cleanResourceId);
        if (dbThread && dbThread.userId === cleanUserId) {
          return true;
        }
      } catch {}

      return false;
    }

    case 'bio_profile': {
      try {
        const doc = loadUserBio(cleanUserId);
        const profile = doc.profiles?.find((p) => p.id === cleanResourceId);
        return Boolean(profile);
      } catch {
        return false;
      }
    }

    case 'bio_entry': {
      try {
        const doc = loadUserBio(cleanUserId);
        for (const profile of doc.profiles || []) {
          const entry = profile.entries?.find((e) => e.id === cleanResourceId);
          if (entry) return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    case 'workspace_file': {
      try {
        const root = getUserWorkspaceRoot(cleanUserId);
        const resolved = validateAndResolvePath(root, cleanResourceId);
        return Boolean(resolved && resolved.startsWith(root));
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Check if a resource exists and belongs to ANOTHER user.
 * Returns true ONLY if the resource exists AND is owned by someone else.
 * Returns false if the resource does not exist or is owned by the current user.
 */
export async function isResourceOwnedByOther(resourceType, resourceId, userId) {
  if (!resourceType || !resourceId) return false;
  const cleanUserId = String(userId || '');
  const cleanResourceId = String(resourceId);

  switch (resourceType) {
    case 'thread': {
      // 1. Check local directory across other users
      try {
        const dataDir = getDataDir();
        if (fs.existsSync(dataDir)) {
          const safeId = cleanResourceId.replace(/[^a-zA-Z0-9_-]/g, '_');
          const entries = fs.readdirSync(dataDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && entry.name !== cleanUserId) {
              const otherPath = path.join(dataDir, entry.name, `${safeId}.json`);
              if (fs.existsSync(otherPath)) {
                return true;
              }
            }
          }
        }
      } catch {}

      // 2. Check Supabase conversations for other user
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client
            .from('conversations')
            .select('user_id')
            .eq('id', cleanResourceId)
            .maybeSingle();
          if (data && data.user_id && data.user_id !== cleanUserId) {
            return true;
          }
        }
      } catch {}

      return false;
    }

    default:
      return false;
  }
}

/**
 * Timing-safe HTTP 404 response.
 * Missing resource and resource owned by someone else return the EXACT SAME body
 * and normalized timing floor to prevent timing attacks.
 */
export async function sendUniformNotFound(res, startMs = Date.now(), { req = null, resourceType = 'resource' } = {}) {
  // Normalize timing so attacker cannot distinguish cache hit vs db query
  const elapsed = Date.now() - startMs;
  const timingFloorMs = 35;
  if (elapsed < timingFloorMs) {
    await new Promise((r) => setTimeout(r, timingFloorMs - elapsed));
  }

  // Audit log denied access attempt (record user ID and route, NEVER content)
  if (req) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const userId = req.userId || 'unauthenticated';
    const route = req.originalUrl || req.url || '';

    // Record miss for rate limiting
    const isRateLimited = recordMissAndCheckRateLimit(userId !== 'unauthenticated' ? userId : ip);
    if (isRateLimited) {
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Access rate limit exceeded. Please slow down.'
      });
    }

    logDbAudit({
      userId,
      action: 'ACCESS_DENIED_OR_NOT_FOUND',
      details: {
        route,
        resourceType,
        ipAddress: String(ip).slice(0, 100)
      },
      ipAddress: String(ip).slice(0, 100)
    }).catch(() => {});
  }

  return res.status(404).json({
    ok: false,
    error: 'Resource not found'
  });
}

/**
 * Generate a short-lived HMAC signed token for downloading user-owned files.
 */
export function generateSignedDownloadToken(userId, relPath, secret, expiresInSec = 300) {
  const expires = Date.now() + expiresInSec * 1000;
  const payload = `${userId}:${relPath}:${expires}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return { token: `${expires}.${sig}`, expires };
}

/**
 * Verify a short-lived HMAC signed token for downloading user-owned files.
 */
export function verifySignedDownloadToken(token, userId, relPath, secret) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;

  const expiresStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expires = Number(expiresStr);

  if (isNaN(expires) || Date.now() > expires) {
    return false;
  }

  const payload = `${userId}:${relPath}:${expires}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
