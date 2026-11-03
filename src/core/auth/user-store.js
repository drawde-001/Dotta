import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { syncUserToDb } from '../db/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, '../../data/users.json');

// Accounts are created through sign-up. Optional admin/reviewer accounts can be
// provisioned from environment variables (see .env.example); no credentials
// are stored in source.

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

  // Optional operator-provisioned accounts. Credentials come ONLY from the
  // environment (never from source) and are created only if missing.
  const seeds = [
    { emailKey: 'ADMIN_EMAIL', passKey: 'ADMIN_PASSWORD', nameKey: 'ADMIN_NAME', role: 'admin', id: 'user-admin' },
    { emailKey: 'REVIEWER_EMAIL', passKey: 'REVIEWER_PASSWORD', nameKey: 'REVIEWER_NAME', role: 'judge', id: 'user-reviewer' }
  ];
  for (const s of seeds) {
    const seedEmail = String(process.env[s.emailKey] || '').trim().toLowerCase();
    const seedPass = String(process.env[s.passKey] || '');
    if (!seedEmail || !seedEmail.includes('@') || seedPass.length < 12) continue;
    if (usersList.some((u) => u.email === seedEmail)) continue;
    const { hash, salt } = hashPassword(seedPass);
    const displayName = process.env[s.nameKey] || seedEmail.split('@')[0];
    usersList.push({
      id: s.id,
      email: seedEmail,
      name: displayName,
      firstName: displayName.split(' ')[0] || '',
      lastName: displayName.split(' ').slice(1).join(' '),
      role: s.role,
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
  const user = findUserByEmail(cleanEmail);

  if (!user || !user.hash || !user.salt) {
    // Burn comparable CPU time so unknown emails are not distinguishable by timing
    verifyPassword(String(password || ''), '00', '00');
    return null;
  }

  const valid = verifyPassword(String(password || ''), user.hash, user.salt);
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
