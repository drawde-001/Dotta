import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { syncUserToDb } from '../db/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, '../../data/users.json');

// Default initial master credentials for Eddy
export const DEFAULT_CREDENTIALS = {
  email: 'eddy@dotta.ai',
  password: 'Dotta2026!',
  name: 'Edward Obi (Eddy)',
  firstName: 'Edward',
  lastName: 'Obi',
  role: 'admin'
};

// Official credentials for Hackathon Judges & Reviewers
export const JUDGES_CREDENTIALS = {
  email: 'judges@dotta.ai',
  password: 'DottaJudges2026!',
  name: 'Hackathon Judges & Reviewers',
  firstName: 'Hackathon',
  lastName: 'Judges',
  role: 'judge'
};

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  try {
    const check = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

export function loadUsers() {
  let usersList = [];
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        usersList = data;
      }
    }
  } catch (err) {
    console.warn('[UserStore] Error reading users.json:', err.message);
  }

  // 1. Ensure Eddy's master account exists
  const hasEddy = usersList.some((u) => u.email === 'eddy@dotta.ai');
  if (!hasEddy) {
    const { hash, salt } = hashPassword(DEFAULT_CREDENTIALS.password);
    usersList.unshift({
      id: 'user-eddy-master',
      email: DEFAULT_CREDENTIALS.email.toLowerCase(),
      name: DEFAULT_CREDENTIALS.name,
      firstName: DEFAULT_CREDENTIALS.firstName,
      lastName: DEFAULT_CREDENTIALS.lastName,
      role: DEFAULT_CREDENTIALS.role,
      hash,
      salt,
      createdAt: Date.now()
    });
  }

  // 2. Ensure Judges account exists
  const hasJudges = usersList.some((u) => u.email === 'judges@dotta.ai');
  if (!hasJudges) {
    const { hash, salt } = hashPassword(JUDGES_CREDENTIALS.password);
    usersList.push({
      id: 'user-judges-review',
      email: JUDGES_CREDENTIALS.email.toLowerCase(),
      name: JUDGES_CREDENTIALS.name,
      firstName: JUDGES_CREDENTIALS.firstName,
      lastName: JUDGES_CREDENTIALS.lastName,
      role: JUDGES_CREDENTIALS.role,
      hash,
      salt,
      createdAt: Date.now()
    });
  }

  // Persist updated list
  try {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersList, null, 2), 'utf8');
  } catch (err) {
    console.error('[UserStore] Failed to write users.json:', err.message);
  }

  // Asynchronously synchronize all active users to Supabase database
  for (const u of usersList) {
    syncUserToDb(u).catch(() => {});
  }

  return usersList;
}

export function saveUsers(users) {
  try {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('[UserStore] Failed to save users:', err.message);
  }
}

export function findUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const users = loadUsers();
  return users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) || null;
}

export function findUserById(id) {
  if (!id) return null;
  const users = loadUsers();
  return users.find((u) => u.id === id) || null;
}

export function sanitizeUserOutput(user) {
  if (!user) return null;
  // eslint-disable-next-line no-unused-vars
  const { hash, salt, ...safeUser } = user;
  return safeUser;
}

export function verifyUserCredentials(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  let user = findUserByEmail(cleanEmail);

  if (!user && cleanEmail === 'eddy@dotta.ai') {
    user = findUserByEmail('eddy@dotta.ai');
  }
  if (!user && cleanEmail === 'judges@dotta.ai') {
    user = findUserByEmail('judges@dotta.ai');
  }

  if (!user || !user.hash || !user.salt) return null;
  let valid = verifyPassword(password, user.hash, user.salt);

  if (!valid && user.email === 'eddy@dotta.ai' && password === DEFAULT_CREDENTIALS.password) {
    valid = true;
  }
  if (!valid && user.email === 'judges@dotta.ai' && password === JUDGES_CREDENTIALS.password) {
    valid = true;
  }

  return valid ? sanitizeUserOutput(user) : null;
}

export function createUser({ email, password, firstName, lastName, name }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const existing = findUserByEmail(cleanEmail);
  if (existing) {
    throw new Error('An account with this email address already exists.');
  }

  const users = loadUsers();
  const { hash, salt } = hashPassword(password);
  const fullName = name || [firstName, lastName].filter(Boolean).join(' ') || cleanEmail.split('@')[0];

  const newUser = {
    id: `user-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    email: cleanEmail,
    name: fullName,
    firstName: firstName || '',
    lastName: lastName || '',
    role: 'user',
    hash,
    salt,
    createdAt: Date.now()
  };

  users.push(newUser);
  saveUsers(users);

  // Synchronize new signup directly to Supabase database
  syncUserToDb(newUser).catch((err) => {
    console.warn(`[UserStore] Supabase signup sync error for ${newUser.email}:`, err.message);
  });

  return sanitizeUserOutput(newUser);
}
