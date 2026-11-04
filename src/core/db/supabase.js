/**
 * src/core/db/supabase.js
 *
 * Authoritative Supabase Database Client for Dotta.
 * Synchronizes users, profiles, active sessions, conversations/threads, runs, and audit logs.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_CREDENTIALS_FILE = path.resolve(__dirname, '../../data/credentials.json');
const LOCAL_INTEGRATIONS_FILE = path.resolve(__dirname, '../../data/integrations.json');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabaseInstance = null;

export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseInstance && url && key) {
    try {
      supabaseInstance = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    } catch (err) {
      console.warn('[Supabase] Initialization warning:', err.message);
    }
  }
  return supabaseInstance;
}

export function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  return Boolean(url && key);
}

/**
 * Upsert a user into Supabase public.users and public.user_profiles
 */
export async function syncUserToDb(user) {
  const sb = getSupabaseClient();
  if (!sb || !user?.id || !user?.email) return null;

  try {
    const passwordHash = user.salt && user.hash ? `${user.salt}:${user.hash}` : (user.password_hash || user.hash || 'managed');
    const now = new Date().toISOString();

    const normEmail = user.email.toLowerCase().trim();

    // Check if user already exists in Supabase by email
    const { data: existingUser } = await sb
      .from('users')
      .select('id')
      .eq('email', normEmail)
      .maybeSingle();

    const effectiveUserId = existingUser?.id || user.id;

    if (existingUser) {
      // 1a. Update existing user in public.users
      const { error: userErr } = await sb
        .from('users')
        .update({
          password_hash: passwordHash,
          updated_at: now
        })
        .eq('id', existingUser.id);

      if (userErr) {
        console.warn(`[Supabase] Error updating user ${user.email}:`, userErr.message);
      }
    } else {
      // 1b. Upsert new user in public.users to prevent race conditions
      const { error: userErr } = await sb.from('users').upsert({
        id: user.id,
        email: normEmail,
        password_hash: passwordHash,
        created_at: now,
        updated_at: now
      }, { onConflict: 'id' });

      if (userErr) {
        console.warn(`[Supabase] Error syncing user ${user.email}:`, userErr.message);
        return null;
      }
    }

    // 2. Upsert public.user_profiles
    const { error: profileErr } = await sb.from('user_profiles').upsert({
      user_id: effectiveUserId,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email.split('@')[0],
      bio: user.bio || (user.role === 'admin' ? 'Master Administrator' : user.role === 'judge' ? 'Hackathon Judge & Reviewer' : 'Dotta User'),
      preferences: { role: user.role || 'user' },
      updated_at: now
    }, { onConflict: 'user_id' });

    if (profileErr) {
      console.warn(`[Supabase] Error syncing user profile for ${effectiveUserId}:`, profileErr.message);
    }

    // 3. Upsert public.user_settings
    await sb.from('user_settings').upsert({
      user_id: effectiveUserId,
      default_model: 'muse-spark-open',
      thinking_budget: 2048,
      auto_save: true,
      updated_at: now
    }, { onConflict: 'user_id' });

    return true;
  } catch (err) {
    console.warn('[Supabase] syncUserToDb unexpected error:', err.message);
    return null;
  }
}

/**
 * Fetch user record from Supabase by email
 */
export async function getDbUserByEmail(email) {
  const sb = getSupabaseClient();
  if (!sb || !email) return null;

  try {
    const { data, error } = await sb
      .from('users')
      .select('*, user_profiles(*)')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Record an authenticated session in public.user_sessions
 */
export async function logDbUserSession({ sessionId, userId, userAgent = '', ipAddress = '' }) {
  const sb = getSupabaseClient();
  if (!sb || !sessionId || !userId) return null;

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365).toISOString();

    const { error } = await sb.from('user_sessions').upsert({
      id: sessionId,
      user_id: userId,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      ip_address: ipAddress ? String(ipAddress).slice(0, 100) : null,
      last_active_at: now.toISOString(),
      expires_at: expiresAt
    }, { onConflict: 'id' });

    if (error) {
      console.warn('[Supabase] logDbUserSession warning:', error.message);
    }
  } catch (err) {
    console.warn('[Supabase] logDbUserSession unexpected error:', err.message);
  }
}

/**
 * Ensure a user exists in public.users and public.user_profiles to prevent foreign key errors
 */
export async function ensureDbUser(userId, fallbackData = {}) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return null;

  try {
    const cleanId = String(userId);
    const { data: existing } = await sb
      .from('users')
      .select('id')
      .eq('id', cleanId)
      .maybeSingle();

    if (!existing) {
      const now = new Date().toISOString();
      const email = fallbackData.email || `${cleanId}@dotta.local`;
      const name = fallbackData.name || cleanId;

      await sb.from('users').upsert({
        id: cleanId,
        email,
        password_hash: 'managed',
        created_at: now,
        updated_at: now
      }, { onConflict: 'id' });

      await sb.from('user_profiles').upsert({
        user_id: cleanId,
        name,
        bio: 'Dotta User',
        preferences: fallbackData.preferences || {},
        updated_at: now
      }, { onConflict: 'user_id' });

      await sb.from('user_settings').upsert({
        user_id: cleanId,
        default_model: 'muse-spark-open',
        thinking_budget: 2048,
        auto_save: true,
        updated_at: now
      }, { onConflict: 'user_id' });
    }
    return cleanId;
  } catch (err) {
    console.warn('[Supabase] ensureDbUser warning:', err.message);
    return null;
  }
}

/**
 * Record an uploaded attachment in public.user_uploads, user_profiles, and audit logs
 */
export async function recordDbUserUpload({
  id = null,
  userId,
  threadId = null,
  name,
  size = 0,
  type = 'application/octet-stream',
  workspacePath = '',
  metadata = {}
}) {
  const sb = getSupabaseClient();
  if (!sb || !userId || !name) return null;

  try {
    const cleanUserId = String(userId);
    await ensureDbUser(cleanUserId);

    const uploadId = id || crypto.randomUUID();
    const now = new Date().toISOString();

    // 1. Insert into public.user_uploads
    const { data: inserted, error: uploadErr } = await sb
      .from('user_uploads')
      .upsert({
        id: uploadId,
        user_id: cleanUserId,
        thread_id: threadId ? String(threadId) : null,
        name: String(name).slice(0, 255),
        size: Number(size) || 0,
        mime_type: String(type || 'application/octet-stream').slice(0, 100),
        workspace_path: String(workspacePath || ''),
        metadata,
        created_at: now
      }, { onConflict: 'id' })
      .select()
      .single();

    if (uploadErr) {
      console.warn('[Supabase] recordDbUserUpload table warning:', uploadErr.message);
    }

    // 2. Tie directly into public.user_profiles.preferences.uploads
    try {
      const { data: profile } = await sb
        .from('user_profiles')
        .select('preferences')
        .eq('user_id', cleanUserId)
        .maybeSingle();

      const prefs = profile?.preferences || {};
      const existingUploads = Array.isArray(prefs.uploads) ? prefs.uploads : [];
      const newUploadEntry = {
        id: uploadId,
        name: String(name),
        size: Number(size) || 0,
        type: String(type || 'application/octet-stream'),
        workspacePath: String(workspacePath || ''),
        threadId: threadId || null,
        uploadedAt: now
      };

      const updatedUploads = [newUploadEntry, ...existingUploads.filter((u) => u.id !== uploadId)].slice(0, 50);

      await sb.from('user_profiles').update({
        preferences: {
          ...prefs,
          uploads: updatedUploads
        },
        updated_at: now
      }).eq('user_id', cleanUserId);
    } catch (profErr) {
      console.warn('[Supabase] recordDbUserUpload profile sync error:', profErr.message);
    }

    // 3. Log audit action
    await logDbAudit({
      userId: cleanUserId,
      action: 'FILE_UPLOAD',
      details: { uploadId, name, size, type, workspacePath, threadId }
    });

    return inserted || { id: uploadId, user_id: cleanUserId, name, workspace_path: workspacePath };
  } catch (err) {
    console.warn('[Supabase] recordDbUserUpload unexpected error:', err.message);
    return null;
  }
}

/**
 * List uploaded files for a user from public.user_uploads
 */
export async function listDbUserUploads(userId) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return [];

  try {
    const { data, error } = await sb
      .from('user_uploads')
      .select('*')
      .eq('user_id', String(userId))
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return [];
    return data;
  } catch (err) {
    console.warn('[Supabase] listDbUserUploads error:', err.message);
    return [];
  }
}

/**
 * Upsert a conversation/thread into Supabase public.conversations
 */
export async function saveDbConversation(userId, threadId, threadData = {}) {
  const sb = getSupabaseClient();
  if (!sb || !userId || !threadId) return null;

  try {
    const cleanUserId = String(userId);
    // Ensure user exists in users table before saving thread to satisfy foreign key constraint
    await ensureDbUser(cleanUserId);

    const now = new Date().toISOString();
    const title = threadData.title || 'New chat';

    // Normalize messages across messages, turns, and contents arrays
    let messages = [];
    if (Array.isArray(threadData.messages) && threadData.messages.length > 0) {
      messages = threadData.messages;
    } else if (Array.isArray(threadData.turns) && threadData.turns.length > 0) {
      messages = threadData.turns.map((t, idx) => {
        const text = Array.isArray(t.parts)
          ? t.parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('')
          : (typeof t.text === 'string' ? t.text : '');
        return {
          id: `msg-${idx + 1}`,
          role: t.role === 'model' ? 'assistant' : (t.role || 'user'),
          content: text,
          parts: t.parts,
          timestamp: t.timestamp || Date.now()
        };
      });
    } else if (Array.isArray(threadData.contents) && threadData.contents.length > 0) {
      messages = threadData.contents.map((c, idx) => {
        const text = Array.isArray(c.parts)
          ? c.parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('')
          : (typeof c.text === 'string' ? c.text : '');
        return {
          id: `msg-${idx + 1}`,
          role: c.role === 'model' ? 'assistant' : (c.role || 'user'),
          content: text,
          parts: c.parts,
          timestamp: Date.now()
        };
      });
    }

    const metadata = {
      status: threadData.status || 'regular',
      lastMessageAt: threadData.lastMessageAt || now,
      messageCount: messages.length,
      model: threadData.model || 'muse-spark-open',
      ...(threadData.metadata || {})
    };

    const { error } = await sb.from('conversations').upsert({
      id: String(threadId),
      user_id: cleanUserId,
      title: String(title).slice(0, 255),
      messages,
      metadata,
      updated_at: now
    }, { onConflict: 'id' });

    if (error) {
      console.warn(`[Supabase] saveDbConversation error (${threadId}):`, error.message);
    }
  } catch (err) {
    console.warn('[Supabase] saveDbConversation unexpected error:', err.message);
  }
}


/**
 * List conversations for a specific user from Supabase
 */
export async function listDbConversations(userId) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return [];

  try {
    const { data, error } = await sb
      .from('conversations')
      .select('id, title, created_at, updated_at, messages, metadata')
      .eq('user_id', String(userId))
      .order('updated_at', { ascending: false });

    if (error || !Array.isArray(data)) return [];

    return data.map((c) => ({
      id: c.id,
      title: c.title || 'New chat',
      status: c.metadata?.status || 'regular',
      lastMessageAt: c.metadata?.lastMessageAt || c.updated_at || c.created_at,
      createdAt: c.created_at,
      updated_at: c.updated_at,
      messageCount: Array.isArray(c.messages) ? c.messages.length : (c.metadata?.messageCount || 0)
    }));
  } catch (err) {
    console.warn('[Supabase] listDbConversations error:', err.message);
    return [];
  }
}

/**
 * Get a specific conversation from Supabase
 */
export async function getDbConversation(userId, threadId) {
  const sb = getSupabaseClient();
  if (!sb || !userId || !threadId) return null;

  try {
    const { data, error } = await sb
      .from('conversations')
      .select('*')
      .eq('user_id', String(userId))
      .eq('id', String(threadId))
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      threadId: data.id,
      userId: data.user_id,
      title: data.title,
      messages: data.messages || [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      ...(data.metadata || {})
    };
  } catch {
    return null;
  }
}

/**
 * Delete a conversation from Supabase
 */
export async function deleteDbConversation(userId, threadId) {
  const sb = getSupabaseClient();
  if (!sb || !userId || !threadId) return false;

  try {
    const { error } = await sb
      .from('conversations')
      .delete()
      .eq('user_id', String(userId))
      .eq('id', String(threadId));

    return !error;
  } catch {
    return false;
  }
}

/**
 * Log an audit action to public.user_audit_logs
 */
export async function logDbAudit({ userId, action, details = {}, ipAddress = '' }) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return;

  try {
    await sb.from('user_audit_logs').insert({
      user_id: String(userId),
      action: String(action),
      details,
      ip_address: ipAddress ? String(ipAddress).slice(0, 100) : null
    });
  } catch {}
}

// -----------------------------------------------------------------------------
// User-Funded Billing Credentials & Integrations Storage
// -----------------------------------------------------------------------------

function readLocalJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {}
  return [];
}

function writeLocalJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[Db] Failed to write ${path.basename(filePath)}:`, err.message);
  }
}

/**
 * Save an encrypted credential secret to public.user_credentials_secret.
 * Accessible only by service_role (zero policies for client roles).
 */
export async function saveUserCredentialsSecret({
  userId,
  provider,
  encryptedPayload,
  keyVersion = 1
}) {
  if (!userId || !provider || !encryptedPayload) {
    throw new Error('[Db] Missing required fields for saveUserCredentialsSecret');
  }

  const normUserId = String(userId);
  const normProvider = String(provider).toLowerCase().trim();
  const now = new Date().toISOString();

  // Local fallback persistence (storing ONLY encrypted ciphertext)
  const localList = readLocalJson(LOCAL_CREDENTIALS_FILE);
  const existingIdx = localList.findIndex(
    (item) => item.user_id === normUserId && item.provider === normProvider
  );
  const record = {
    user_id: normUserId,
    provider: normProvider,
    encrypted_payload: encryptedPayload,
    key_version: keyVersion,
    updated_at: now
  };
  if (existingIdx >= 0) {
    localList[existingIdx] = { ...localList[existingIdx], ...record };
  } else {
    localList.push({ ...record, created_at: now });
  }
  writeLocalJson(LOCAL_CREDENTIALS_FILE, localList);

  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { error } = await sb.from('user_credentials_secret').upsert(
        {
          user_id: normUserId,
          provider: normProvider,
          encrypted_payload: encryptedPayload,
          key_version: keyVersion,
          updated_at: now
        },
        { onConflict: 'user_id,provider' }
      );
      if (error) {
        console.warn('[Supabase] user_credentials_secret upsert warning:', error.message);
      }
    } catch (err) {
      console.warn('[Supabase] user_credentials_secret unexpected error:', err.message);
    }
  }

  return true;
}

/**
 * Fetch an encrypted credential secret by userId and provider.
 * Returns { encrypted_payload, key_version } or null.
 */
export async function getUserCredentialsSecret(userId, provider) {
  if (!userId || !provider) return null;

  const normUserId = String(userId);
  const normProvider = String(provider).toLowerCase().trim();

  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('user_credentials_secret')
        .select('encrypted_payload, key_version, updated_at')
        .eq('user_id', normUserId)
        .eq('provider', normProvider)
        .maybeSingle();

      if (!error && data) {
        return {
          encryptedPayload: data.encrypted_payload,
          keyVersion: data.key_version,
          updatedAt: data.updated_at
        };
      }
    } catch {}
  }

  // Fallback to local store
  const localList = readLocalJson(LOCAL_CREDENTIALS_FILE);
  const found = localList.find(
    (item) => item.user_id === normUserId && item.provider === normProvider
  );
  if (found) {
    return {
      encryptedPayload: found.encrypted_payload,
      keyVersion: found.key_version,
      updatedAt: found.updated_at
    };
  }

  return null;
}

/**
 * Save user integration status and masked hint to public.user_integrations.
 */
export async function saveUserIntegration({
  userId,
  provider,
  status = 'not_configured',
  maskedHint = null,
  verifiedAt = null,
  lastErrorCode = null
}) {
  if (!userId || !provider) {
    throw new Error('[Db] Missing required fields for saveUserIntegration');
  }

  const normUserId = String(userId);
  const normProvider = String(provider).toLowerCase().trim();
  const now = new Date().toISOString();

  // Local fallback
  const localList = readLocalJson(LOCAL_INTEGRATIONS_FILE);
  const existingIdx = localList.findIndex(
    (item) => item.user_id === normUserId && item.provider === normProvider
  );
  const record = {
    user_id: normUserId,
    provider: normProvider,
    status,
    masked_hint: maskedHint,
    verified_at: verifiedAt || (status === 'connected' ? now : null),
    last_error_code: lastErrorCode,
    updated_at: now
  };
  if (existingIdx >= 0) {
    localList[existingIdx] = { ...localList[existingIdx], ...record };
  } else {
    localList.push(record);
  }
  writeLocalJson(LOCAL_INTEGRATIONS_FILE, localList);

  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { error } = await sb.from('user_integrations').upsert(
        {
          user_id: normUserId,
          provider: normProvider,
          status,
          masked_hint: maskedHint,
          verified_at: verifiedAt || (status === 'connected' ? now : null),
          last_error_code: lastErrorCode,
          updated_at: now
        },
        { onConflict: 'user_id,provider' }
      );
      if (error) {
        console.warn('[Supabase] user_integrations upsert warning:', error.message);
      }
    } catch (err) {
      console.warn('[Supabase] user_integrations error:', err.message);
    }
  }

  return true;
}

/**
 * Retrieve user integration status and masked hint.
 */
export async function getUserIntegration(userId, provider) {
  if (!userId || !provider) return null;

  const normUserId = String(userId);
  const normProvider = String(provider).toLowerCase().trim();

  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('user_integrations')
        .select('*')
        .eq('user_id', normUserId)
        .eq('provider', normProvider)
        .maybeSingle();

      if (!error && data) {
        return {
          userId: data.user_id,
          provider: data.provider,
          status: data.status,
          maskedHint: data.masked_hint,
          verifiedAt: data.verified_at,
          lastErrorCode: data.last_error_code
        };
      }
    } catch {}
  }

  // Fallback to local store
  const localList = readLocalJson(LOCAL_INTEGRATIONS_FILE);
  const found = localList.find(
    (item) => item.user_id === normUserId && item.provider === normProvider
  );
  if (found) {
    return {
      userId: found.user_id,
      provider: found.provider,
      status: found.status,
      maskedHint: found.masked_hint,
      verifiedAt: found.verified_at,
      lastErrorCode: found.last_error_code
    };
  }

  return {
    userId: normUserId,
    provider: normProvider,
    status: 'not_configured',
    maskedHint: null,
    verifiedAt: null,
    lastErrorCode: null
  };
}

/**
 * List all integrations for a given user.
 * Returns an array containing the integration statuses for 'meta' and 'modal'.
 */
export async function listUserIntegrations(userId) {
  if (!userId) return [];
  const normUserId = String(userId);

  const metaIntegration = await getUserIntegration(normUserId, 'meta');
  const modalIntegration = await getUserIntegration(normUserId, 'modal');

  return [metaIntegration, modalIntegration];
}

/**
 * Disconnect an integration:
 * Deletes the secret record and resets integration status to 'not_configured'.
 */
export async function deleteUserCredentials(userId, provider) {
  if (!userId || !provider) return false;

  const normUserId = String(userId);
  const normProvider = String(provider).toLowerCase().trim();

  // 1. Delete from local credentials
  const localCreds = readLocalJson(LOCAL_CREDENTIALS_FILE).filter(
    (item) => !(item.user_id === normUserId && item.provider === normProvider)
  );
  writeLocalJson(LOCAL_CREDENTIALS_FILE, localCreds);

  // 2. Reset local integration status
  const localIntegrations = readLocalJson(LOCAL_INTEGRATIONS_FILE);
  const intIdx = localIntegrations.findIndex(
    (item) => item.user_id === normUserId && item.provider === normProvider
  );
  if (intIdx >= 0) {
    localIntegrations[intIdx] = {
      ...localIntegrations[intIdx],
      status: 'not_configured',
      masked_hint: null,
      verified_at: null,
      last_error_code: null,
      updated_at: new Date().toISOString()
    };
    writeLocalJson(LOCAL_INTEGRATIONS_FILE, localIntegrations);
  }

  // 3. Supabase deletion & update
  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb
        .from('user_credentials_secret')
        .delete()
        .eq('user_id', normUserId)
        .eq('provider', normProvider);

      await sb.from('user_integrations').upsert(
        {
          user_id: normUserId,
          provider: normProvider,
          status: 'not_configured',
          masked_hint: null,
          verified_at: null,
          last_error_code: null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,provider' }
      );
    } catch (err) {
      console.warn('[Supabase] deleteUserCredentials error:', err.message);
    }
  }

  return true;
}

/**
 * Persist user BIO vault (profiles, proposals, answers) to Supabase public.user_bio_vaults
 */
export async function saveDbBioVault(userId, bioDoc) {
  const sb = getSupabaseClient();
  if (!sb || !userId || !bioDoc) return null;

  try {
    const cleanUserId = String(userId);
    await ensureDbUser(cleanUserId);

    const now = new Date().toISOString();
    const { error } = await sb.from('user_bio_vaults').upsert(
      {
        user_id: cleanUserId,
        profiles: Array.isArray(bioDoc.profiles) ? bioDoc.profiles : [],
        proposals: Array.isArray(bioDoc.proposals) ? bioDoc.proposals : [],
        answers: Array.isArray(bioDoc.answers) ? bioDoc.answers : [],
        updated_at: now
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.warn(`[Supabase] saveDbBioVault warning for ${cleanUserId}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] saveDbBioVault unexpected error:', err.message);
    return false;
  }
}

/**
 * Fetch user BIO vault from Supabase public.user_bio_vaults
 */
export async function getDbBioVault(userId) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return null;

  try {
    const cleanUserId = String(userId);
    const { data, error } = await sb
      .from('user_bio_vaults')
      .select('*')
      .eq('user_id', cleanUserId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      userId: data.user_id,
      profiles: Array.isArray(data.profiles) ? data.profiles : [],
      proposals: Array.isArray(data.proposals) ? data.proposals : [],
      answers: Array.isArray(data.answers) ? data.answers : [],
      createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
      updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now()
    };
  } catch {
    return null;
  }
}

