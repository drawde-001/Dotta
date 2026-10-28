import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getDataDir() {
  const dir = process.env.AGENT_DATA_DIR || path.resolve(__dirname, '../../data/threads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getThreadFilePath(threadId) {
  const safeId = String(threadId).replace(/[^a-zA-Z0-9_-]/g, '_');
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

export function getThreadState(threadId) {
  if (!threadId) return null;
  const filePath = getThreadFilePath(threadId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[AgentStore Error reading thread ${threadId}]:`, err.message);
    return null;
  }
}

export function saveThreadState(threadId, patch = {}) {
  if (!threadId) return null;
  const existing = getThreadState(threadId) || {
    threadId,
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
    updatedAt: Date.now()
  };

  const filePath = getThreadFilePath(threadId);
  atomicWriteJson(filePath, updated);
  return updated;
}

export function persistTurn(threadId, { role, parts, turnIndex, usageMetadata }) {
  if (!threadId) return;
  const state = getThreadState(threadId) || {
    threadId,
    createdAt: Date.now(),
    status: 'active',
    contents: [],
    turns: []
  };

  const newTurn = {
    turnIndex: turnIndex ?? (state.turns.length + 1),
    role,
    parts,
    usageMetadata: usageMetadata || null,
    timestamp: Date.now()
  };

  state.turns.push(newTurn);
  state.contents.push({ role, parts });
  state.updatedAt = Date.now();

  const filePath = getThreadFilePath(threadId);
  atomicWriteJson(filePath, state);
  return state;
}

export function saveInterrupt(threadId, interruptData) {
  return saveThreadState(threadId, {
    status: 'interrupted',
    interrupt: {
      ...interruptData,
      savedAt: Date.now()
    }
  });
}

export function clearInterrupt(threadId) {
  return saveThreadState(threadId, {
    status: 'active',
    interrupt: null
  });
}

export function getThreadApprovals(threadId) {
  if (!threadId) return new Set();
  const state = getThreadState(threadId);
  return new Set(Array.isArray(state?.approvals) ? state.approvals : []);
}

export function addThreadApproval(threadId, approvalKey) {
  if (!threadId || !approvalKey) return;
  const state = getThreadState(threadId) || { threadId, status: 'active', approvals: [] };
  const current = new Set(Array.isArray(state.approvals) ? state.approvals : []);
  current.add(String(approvalKey));
  return saveThreadState(threadId, { approvals: Array.from(current) });
}

export function getInterruptHistory(threadId) {
  if (!threadId) return [];
  const state = getThreadState(threadId);
  const raw = Array.isArray(state?.interruptHistory) ? state.interruptHistory : [];
  return raw.map((item) => (typeof item === 'object' && item !== null ? item.key : String(item)));
}

export function getInterruptAnswer(threadId, interruptKey) {
  if (!threadId || !interruptKey) return undefined;
  const state = getThreadState(threadId);
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

export function recordInterruptHistory(threadId, interruptKey, answer = undefined) {
  if (!threadId || !interruptKey) return;
  const state = getThreadState(threadId) || { threadId, status: 'active', interruptHistory: [] };
  const list = Array.isArray(state.interruptHistory) ? [...state.interruptHistory] : [];
  const strKey = String(interruptKey);

  const existingIdx = list.findIndex(
    (item) => (typeof item === 'object' && item !== null ? item.key === strKey : item === strKey)
  );

  if (existingIdx >= 0) {
    if (answer !== undefined) {
      list[existingIdx] = { key: strKey, answer, timestamp: Date.now() };
      return saveThreadState(threadId, { interruptHistory: list });
    }
  } else {
    list.push({ key: strKey, answer, timestamp: Date.now() });
    return saveThreadState(threadId, { interruptHistory: list });
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
