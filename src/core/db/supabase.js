/**
 * src/core/db/supabase.js
 *
 * Authoritative Supabase Database Client for Dotta.
 * Synchronizes users, profiles, active sessions, conversations/threads, runs, and audit logs.
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vjuoutdhpnnmasstfiwo.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdW91dGRocG5ubWFzc3RmaXdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNDI1MTQsImV4cCI6MjEwODcxODUxNH0.4iZipyNsXmhvbmrRNKJee7WLvih-OYsX51udLuzM0ec';

let supabaseInstance = null;

export function getSupabaseClient() {
  if (!supabaseInstance && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
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
