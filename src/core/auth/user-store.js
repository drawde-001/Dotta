import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, '../../data/users.json');

// Default initial master credentials for Eddy
export const DEFAULT_CREDENTIALS = {
  email: 'eddy@omniagent.ai',
  password: 'OmniAgent2026!',
  name: 'Edward Obi (Eddy)',
  firstName: 'Edward',
  lastName: 'Obi',
  role: 'admin'
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
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.warn('[UserStore] Error reading users.json:', err.message);
  }

  // Pre-seed Eddy's master account
  const { hash, salt } = hashPassword(DEFAULT_CREDENTIALS.password);
  const initialUsers = [
    {
      id: 'user-eddy-master',
      email: DEFAULT_CREDENTIALS.email.toLowerCase(),
      name: DEFAULT_CREDENTIALS.name,
      firstName: DEFAULT_CREDENTIALS.firstName,
      lastName: DEFAULT_CREDENTIALS.lastName,
      role: DEFAULT_CREDENTIALS.role,
      hash,
      salt,
      createdAt: Date.now()
    }
  ];

  try {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf8');
  } catch (err) {
    console.error('[UserStore] Failed to write initial users.json:', err.message);
  }

  return initialUsers;
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
  const user = findUserByEmail(email);
  if (!user || !user.hash || !user.salt) return null;
  const valid = verifyPassword(password, user.hash, user.salt);
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
  return sanitizeUserOutput(newUser);
}
