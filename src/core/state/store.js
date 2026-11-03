import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { sanitizeUserId } from '../execution/workspace.js';
import { saveDbConversation, deleteDbConversation } from '../db/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getDataDir() {
  const dir = process.env.AGENT_DATA_DIR || path.resolve(__dirname, '../../data/threads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getUserThreadDir(userId) {
  const safeUser = sanitizeUserId(userId);
  if (!safeUser) return getDataDir();
  const dir = path.join(getDataDir(), safeUser);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getUserIndexPath(userId) {
  return path.join(getUserThreadDir(userId), '_index.json');
}

function getThreadFilePath(threadId, userId = null) {
  const safeId = String(threadId).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (userId) {
    return path.join(getUserThreadDir(userId), `${safeId}.json`);
  }
  return path.join(getDataDir(), `${safeId}.json`);
}

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * List threads for a specific user, sorted newest first
 */
export function listUserThreads(userId) {
  if (!userId) return [];
  const indexPath = getUserIndexPath(userId);
  let list = [];
  try {
    if (fs.existsSync(indexPath)) {
      list = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    }
  } catch (err) {
    console.error(`[AgentStore Error reading user thread index for ${userId}]:`, err.message);
  }

  const userDir = getUserThreadDir(userId);
  const dataDir = getDataDir();

  // Legacy auto-migration: check root dataDir for orphaned thread-*.json files
  try {
    const rootFiles = fs.readdirSync(dataDir);
    for (const f of rootFiles) {
      if (f.startsWith('thread-') && f.endsWith('.json')) {
        const legacyPath = path.join(dataDir, f);
        try {
          const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
          const threadId = raw.id || raw.threadId || f.replace(/\.json$/, '');
          // If unowned or owned by this user, copy into this user's secure folder
          if (!raw.userId || raw.userId === userId) {
            const destPath = path.join(userDir, `${threadId}.json`);
            if (!fs.existsSync(destPath)) {
              const normalized = normalizeThreadObject(raw, threadId, userId);
              atomicWriteJson(destPath, normalized);
              saveDbConversation(userId, threadId, normalized).catch(() => {});
            }
          }
        } catch {}
      }
    }
  } catch {}

  // Re-read or construct list from user directory
  try {
    const files = fs.readdirSync(userDir);
    const discovered = [];
    for (const f of files) {
      if (f.endsWith('.json') && f !== '_index.json') {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(userDir, f), 'utf8'));
          const id = raw.id || raw.threadId || f.replace(/\.json$/, '');
          const count = Array.isArray(raw.messages) ? raw.messages.length : (Array.isArray(raw.turns) ? raw.turns.length : 0);
          discovered.push({
            id,
            title: raw.title || 'New chat',
            status: raw.status || 'regular',
            lastMessageAt: raw.lastMessageAt || raw.updatedAt || raw.createdAt || Date.now(),
            createdAt: raw.createdAt || Date.now(),
            updatedAt: raw.updatedAt || Date.now(),
            messageCount: count
          });
        } catch {}
      }
    }
    if (discovered.length > 0) {
      list = discovered;
      atomicWriteJson(indexPath, list);
    }
  } catch {}

  // Sort by lastMessageAt descending
  return list.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
}

/**
 * Normalizes thread data into assistant-ui standard schema with messages array.
 */
export function normalizeThreadObject(raw, threadId = null, userId = null) {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id || raw.threadId || threadId;
  const ownerId = raw.userId || userId;
  const title = raw.title || 'New chat';
  const status = raw.status || 'regular';
  const createdAt = raw.createdAt || Date.now();
  const updatedAt = raw.updatedAt || raw.lastMessageAt || Date.now();
  const lastMessageAt = raw.lastMessageAt || updatedAt;

  // Normalize messages
  let messages = [];
  if (Array.isArray(raw.messages) && raw.messages.length > 0) {
    messages = raw.messages;
  } else if (Array.isArray(raw.turns) && raw.turns.length > 0) {
    messages = raw.turns.map((t, idx) => {
      const role = t.role === 'model' ? 'assistant' : (t.role || 'user');
      const textParts = (t.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text);
      const thoughtParts = (t.parts || []).filter((p) => p.thought && p.text).map((p) => p.text);
      const contentText = textParts.join('\n\n') || (thoughtParts.length > 0 ? thoughtParts.join('\n\n') : '');
      return {
        id: `msg-${t.timestamp || Date.now()}-${idx + 1}`,
        role,
        content: contentText,
        parts: t.parts || [{ text: contentText }],
        timestamp: t.timestamp || Date.now()
      };
    });
  } else if (Array.isArray(raw.contents) && raw.contents.length > 0) {
    messages = raw.contents.map((c, idx) => {
      const role = c.role === 'model' ? 'assistant' : (c.role || 'user');
      const text = (c.parts || []).map((p) => p.text || '').filter(Boolean).join('\n\n');
      return {
        id: `msg-${Date.now()}-${idx + 1}`,
        role,
        content: text,
        parts: c.parts || [{ text }],
        timestamp: Date.now()
      };
    });
  }

  return {
    ...raw,
    id,
    threadId: id,
    userId: ownerId,
    title,
    status,
    messages,
    createdAt,
    updatedAt,
    lastMessageAt
  };
}

/**
 * Retrieve a specific thread for a user with automatic schema normalization & migration.
 */
export function getUserThread(userId, threadId) {
  if (!threadId) return null;
  const userPath = getThreadFilePath(threadId, userId);
  let raw = null;
  let fromLegacy = false;

  if (fs.existsSync(userPath)) {
    try {
      raw = JSON.parse(fs.readFileSync(userPath, 'utf8'));
    } catch {}
  }

  // Fallback to legacy global root thread path
  if (!raw) {
    const globalPath = getThreadFilePath(threadId);
    if (fs.existsSync(globalPath)) {
      try {
        raw = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
        fromLegacy = true;
      } catch {}
    }
  }

  // Fallback to project root data/threads
  if (!raw) {
    const rootDataPath = path.resolve(__dirname, '../../../data/threads', `${String(threadId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    if (fs.existsSync(rootDataPath)) {
      try {
        raw = JSON.parse(fs.readFileSync(rootDataPath, 'utf8'));
        fromLegacy = true;
      } catch {}
    }
  }

  if (!raw) return null;

  // Security check: if legacy thread specifies a different owner, do not return it
  if (raw.userId && userId && raw.userId !== userId) {
    return null;
  }

  const normalized = normalizeThreadObject(raw, threadId, userId);

  // If retrieved from a legacy un-migrated location, copy it to the secure user directory
  if (fromLegacy && userId) {
    try {
      atomicWriteJson(userPath, normalized);
      const list = listUserThreads(userId);
      if (!list.some((t) => t.id === normalized.id)) {
        list.unshift({
          id: normalized.id,
          title: normalized.title,
          status: normalized.status,
          lastMessageAt: normalized.lastMessageAt,
          createdAt: normalized.createdAt,
          updatedAt: normalized.updatedAt,
          messageCount: normalized.messages.length
        });
        atomicWriteJson(getUserIndexPath(userId), list);
      }
      saveDbConversation(userId, normalized.id, normalized).catch(() => {});
    } catch {}
  }

  return normalized;
}

/**
 * Save user thread and sync user thread index
 */
export function saveUserThread(userId, threadId, patch = {}) {
  if (!threadId) return null;
  const existing = getUserThread(userId, threadId) || {
    id: threadId,
    threadId,
    userId: userId || null,
    title: patch.title || 'New chat',
    status: 'regular',
    createdAt: Date.now(),
    messages: [],
    contents: [],
    turns: [],
    contextSummary: '',
    bioSnapshot: {}
  };

  const now = Date.now();
  const updated = {
    ...existing,
    ...patch,
    id: threadId,
    threadId,
    userId: userId || existing.userId,
    updatedAt: now,
    lastMessageAt: patch.lastMessageAt || now
  };

  // Write thread file
  const filePath = getThreadFilePath(threadId, userId);
  atomicWriteJson(filePath, updated);

  // Sync user index
  if (userId) {
    try {
      const list = listUserThreads(userId);
      const idx = list.findIndex((t) => t.id === threadId);
      const summaryItem = {
        id: threadId,
        title: updated.title || 'New chat',
        status: updated.status || 'regular',
        lastMessageAt: updated.lastMessageAt || now,
        createdAt: updated.createdAt || now,
        updatedAt: updated.updatedAt || now,
        messageCount: Array.isArray(updated.messages) ? updated.messages.length : (updated.turns?.length || 0)
      };

      if (idx >= 0) {
        list[idx] = summaryItem;
      } else {
        list.unshift(summaryItem);
      }
      atomicWriteJson(getUserIndexPath(userId), list);
    } catch (err) {
      console.error('[AgentStore Error updating user thread index]:', err.message);
    }
  }

  // Asynchronously synchronize thread to Supabase database
  if (userId) {
    saveDbConversation(userId, threadId, updated).catch((err) => {
      console.warn(`[AgentStore] Supabase conversation sync error for ${threadId}:`, err.message);
    });
  }

  return updated;
}

/**
 * Rename user thread
 */
export function renameUserThread(userId, threadId, newTitle) {
  return saveUserThread(userId, threadId, { title: newTitle });
}

/**
 * Delete user thread
 */
export function deleteUserThread(userId, threadId) {
  if (!threadId) return false;
  const userPath = getThreadFilePath(threadId, userId);
  let deleted = false;
  if (fs.existsSync(userPath)) {
    try {
      fs.unlinkSync(userPath);
      deleted = true;
    } catch {}
  }
  const globalPath = getThreadFilePath(threadId);
  if (fs.existsSync(globalPath)) {
    try {
      fs.unlinkSync(globalPath);
      deleted = true;
    } catch {}
  }

  if (userId) {
    try {
      const list = listUserThreads(userId).filter((t) => t.id !== threadId);
      atomicWriteJson(getUserIndexPath(userId), list);
      deleteDbConversation(userId, threadId).catch(() => {});
    } catch {}
  }
  return deleted;
}

export function getThreadState(threadId, userId = null) {
  if (!threadId) return null;
  if (userId) {
    const userPath = getThreadFilePath(threadId, userId);
    if (fs.existsSync(userPath)) {
      try {
        return JSON.parse(fs.readFileSync(userPath, 'utf8'));
      } catch {}
    }
  }
  const filePath = getThreadFilePath(threadId);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {}
  }
  return null;
}

export function saveThreadState(threadId, patch = {}, userId = null) {
  if (!threadId) return null;
  const existing = getThreadState(threadId, userId) || {
    id: threadId,
    threadId,
    userId: userId || null,
    createdAt: Date.now(),
    status: 'active',
    contents: [],
    turns: [],
    interrupt: null
  };

  const updated = {
    ...existing,
    ...patch,
    threadId,
    userId: userId || existing.userId || null,
    updatedAt: Date.now()
  };

  const filePath = getThreadFilePath(threadId, userId || existing.userId);
  atomicWriteJson(filePath, updated);
  return updated;
}

export function persistTurn(threadId, { role, parts, turnIndex, usageMetadata, userId = null } = {}) {
  if (!threadId) return;
  const state = (userId ? getUserThread(userId, threadId) : null) || getThreadState(threadId, userId) || {
    id: threadId,
    threadId,
    userId: userId || null,
    createdAt: Date.now(),
    status: 'active',
    contents: [],
    turns: []
  };

  const newTurn = {
    turnIndex: turnIndex ?? ((state.turns?.length || 0) + 1),
    role,
    parts,
    usageMetadata: usageMetadata || null,
    timestamp: Date.now()
  };

  if (!Array.isArray(state.turns)) state.turns = [];
  if (!Array.isArray(state.contents)) state.contents = [];
  if (!Array.isArray(state.messages)) state.messages = [];
  state.turns.push(newTurn);
  state.contents.push({ role, parts });

  // Maintain human-readable messages representation for UI and Supabase
  const msgText = Array.isArray(parts)
    ? parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('')
    : (typeof parts === 'string' ? parts : '');

  const attachments = [];
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p.inlineData) {
        attachments.push({
          type: p.inlineData.mimeType,
          name: p.inlineData.name || 'attachment'
        });
      }
    }
  }

  state.messages.push({
    id: crypto.randomUUID(),
    role: role === 'model' ? 'assistant' : role,
    content: msgText,
    parts,
    attachments: attachments.length > 0 ? attachments : undefined,
    timestamp: Date.now()
  });

  state.updatedAt = Date.now();
  state.lastMessageAt = Date.now();
  if (userId && !state.userId) state.userId = userId;

  const targetUser = userId || state.userId;
  if (targetUser) {
    saveUserThread(targetUser, threadId, state);
  } else {
    const filePath = getThreadFilePath(threadId);
    atomicWriteJson(filePath, state);
  }
  return state;
}

export function saveInterrupt(threadId, interruptData, userId = null) {
  return saveThreadState(threadId, {
    status: 'interrupted',
    interrupt: {
      ...interruptData,
      savedAt: Date.now()
    }
  }, userId);
}

export function clearInterrupt(threadId, userId = null) {
  return saveThreadState(threadId, {
    status: 'active',
    interrupt: null
  }, userId);
}

export function getThreadApprovals(threadId, userId = null) {
  if (!threadId) return new Set();
  const state = getThreadState(threadId, userId);
  return new Set(Array.isArray(state?.approvals) ? state.approvals : []);
}

export function addThreadApproval(threadId, approvalKey, userId = null) {
  if (!threadId || !approvalKey) return;
  const state = getThreadState(threadId, userId) || { threadId, userId: userId || null, status: 'active', approvals: [] };
  const current = new Set(Array.isArray(state.approvals) ? state.approvals : []);
  current.add(String(approvalKey));
  return saveThreadState(threadId, { approvals: Array.from(current) }, userId);
}

export function getInterruptHistory(threadId, userId = null) {
  if (!threadId) return [];
  const state = getThreadState(threadId, userId);
  const raw = Array.isArray(state?.interruptHistory) ? state.interruptHistory : [];
  return raw.map((item) => (typeof item === 'object' && item !== null ? item.key : String(item)));
}

export function getInterruptAnswer(threadId, interruptKey, userId = null) {
  if (!threadId || !interruptKey) return undefined;
  const state = getThreadState(threadId, userId);
  const raw = Array.isArray(state?.interruptHistory) ? state.interruptHistory : [];
  const normKey = String(interruptKey).trim().toLowerCase();

  const found = raw.find((item) => {
    if (typeof item === 'object' && item !== null) {
      const k = String(item.key || '').trim().toLowerCase();
      return k === normKey || (k && normKey.includes(k)) || (normKey && k.includes(normKey));
    }
    return false;
  });

  return found && found.answer !== undefined ? found.answer : undefined;
}

export function recordInterruptHistory(threadId, interruptKey, answer = undefined, userId = null) {
  if (!threadId || !interruptKey) return;
  const state = getThreadState(threadId, userId) || { threadId, userId: userId || null, status: 'active', interruptHistory: [] };
  const list = Array.isArray(state.interruptHistory) ? [...state.interruptHistory] : [];
  const strKey = String(interruptKey);

  const existingIdx = list.findIndex(
    (item) => (typeof item === 'object' && item !== null ? item.key === strKey : item === strKey)
  );

  if (existingIdx >= 0) {
    if (answer !== undefined) {
      list[existingIdx] = { key: strKey, answer, timestamp: Date.now() };
      return saveThreadState(threadId, { interruptHistory: list }, userId);
    }
  } else {
    list.push({ key: strKey, answer, timestamp: Date.now() });
    return saveThreadState(threadId, { interruptHistory: list }, userId);
  }
}

export function deleteThread(threadId) {
  const filePath = getThreadFilePath(threadId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Context Management System — Thread Compaction & Sliding Window
 *
 * Implements modern LLM context management best practices:
 * 1. Observation Masking: Compresses verbose older tool outputs (DOM trees, page HTML, large file contents)
 * 2. Sliding Window: Keeps the latest N turns verbatim for direct conversational flow
 * 3. Rolling Summary: Condenses older historical turns into a structured summary block
 */
export function compactThreadContext(contents = [], { maxRecentTurns = 8, maxTokenEstimate = 10000 } = {}) {
  if (!Array.isArray(contents) || contents.length <= maxRecentTurns) {
    return contents;
  }

  // Rough token estimation: 1 token ~= 4 chars
  const estimateTokens = (parts) => {
    let chars = 0;
    for (const p of parts || []) {
      if (typeof p?.text === 'string') chars += p.text.length;
      if (p?.functionCall) chars += JSON.stringify(p.functionCall).length;
      if (p?.functionResponse) chars += JSON.stringify(p.functionResponse).length;
    }
    return Math.ceil(chars / 4);
  };

  const totalTokens = contents.reduce((acc, c) => acc + estimateTokens(c?.parts), 0);
  if (totalTokens < maxTokenEstimate && contents.length <= 14) {
    return contents;
  }

  // Find a clean user prompt boundary (role === 'user' without functionResponse)
  // around target splitIndex so tool call / response pairs are never severed
  let targetSplit = Math.max(0, contents.length - maxRecentTurns);
  let splitIndex = targetSplit;

  // Search forward for a clean user turn
  for (let i = targetSplit; i < contents.length - 2; i++) {
    const item = contents[i];
    if (item?.role === 'user' && !(item.parts || []).some((p) => p.functionResponse)) {
      splitIndex = i;
      break;
    }
  }

  // If no user boundary found forward, search backwards
  if (splitIndex === targetSplit && splitIndex > 0) {
    for (let i = targetSplit; i >= 0; i--) {
      const item = contents[i];
      if (item?.role === 'user' && !(item.parts || []).some((p) => p.functionResponse)) {
        splitIndex = i;
        break;
      }
    }
  }

  if (splitIndex <= 0) {
    // Cannot cleanly split; keep all contents
    return contents;
  }

  const olderContents = contents.slice(0, splitIndex);
  const recentContents = contents.slice(splitIndex);

  // Extract key facts and summarize older turns
  const summaryLines = [];
  for (const c of olderContents) {
    const role = c.role === 'model' || c.role === 'assistant' ? 'Assistant' : 'User';
    for (const p of c.parts || []) {
      if (typeof p?.text === 'string' && p.text.trim()) {
        const clean = p.text.trim().replace(/\s+/g, ' ');
        // Do not include system notes in user summary
        if (!clean.startsWith('[System note:') && !clean.startsWith('[Context Management')) {
          summaryLines.push(`- ${role}: ${clean.slice(0, 160)}${clean.length > 160 ? '...' : ''}`);
        }
      }
      if (p?.functionCall) {
        summaryLines.push(`- Action: invoked ${p.functionCall.name}(${JSON.stringify(p.functionCall.args || {}).slice(0, 100)})`);
      }
      if (p?.functionResponse) {
        const res = p.functionResponse.response;
        const resStr = typeof res === 'string' ? res : JSON.stringify(res || {});
        const resSnippet = resStr.replace(/\s+/g, ' ').slice(0, 100);
        summaryLines.push(`  * Result: ${resSnippet}...`);
      }
    }
  }

  // Mask older observations inside recent window if they exceed 1200 characters
  const compactedRecent = recentContents.map((c, idx) => {
    if (idx < recentContents.length - 2) {
      const newParts = (c.parts || []).map((p) => {
        if (p?.functionResponse) {
          const res = p.functionResponse.response;
          const str = typeof res === 'string' ? res : JSON.stringify(res || {});
          if (str.length > 1200) {
            return {
              ...p,
              functionResponse: {
                ...p.functionResponse,
                response: `[Compacted Observation: ${p.functionResponse.name} (${str.length} bytes). Preview: ${str.slice(0, 600)}... (truncated for context efficiency)]`
              }
            };
          }
        }
        return p;
      });
      return { ...c, parts: newParts };
    }
    return c;
  });

  if (summaryLines.length === 0) {
    return compactedRecent;
  }

  const summaryText = `[Context Management System — Compacted Historical Memory]:\nEarlier conversation turns were compacted to maintain optimal execution focus:\n${summaryLines.slice(-12).join('\n')}\n\n[Continuing execution with recent turns verbatim below]:\n`;

  // Merge into first turn if it's user, ensuring strict role alternation
  if (compactedRecent[0]?.role === 'user' && !(compactedRecent[0].parts || []).some((p) => p.functionResponse)) {
    const firstTurn = compactedRecent[0];
    const existingParts = Array.isArray(firstTurn.parts) ? firstTurn.parts : [];
    return [
      {
        ...firstTurn,
        parts: [{ text: summaryText }, ...existingParts]
      },
      ...compactedRecent.slice(1)
    ];
  }

  const summaryBlock = {
    role: 'user',
    parts: [{ text: summaryText }]
  };

  return [summaryBlock, ...compactedRecent];
}
