#!/usr/bin/env node
/**
 * scripts/reset-password.js
 *
 * Sets a new password for an existing account. Both values are read from
 * environment variables so they never appear in shell history or process lists
 * as command-line arguments, and nothing is printed.
 *
 *   RESET_EMAIL=you@example.com RESET_PASSWORD='a-long-passphrase' node scripts/reset-password.js
 *
 * Existing sessions stay valid until SESSION_SECRET is rotated.
 */

import { loadUsers, saveUsers, hashPassword } from '../src/core/auth/user-store.js';
import { syncUserToDb } from '../src/core/db/supabase.js';

const email = String(process.env.RESET_EMAIL || '').trim().toLowerCase();
const password = String(process.env.RESET_PASSWORD || '');

if (!email || !email.includes('@')) {
  console.error('Set RESET_EMAIL to the account email.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('RESET_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const users = loadUsers();
const user = users.find((u) => String(u.email || '').toLowerCase() === email);
if (!user) {
  console.error('No account found for that email.');
  process.exit(1);
}

const { hash, salt } = hashPassword(password);
user.hash = hash;
user.salt = salt;
user.passwordUpdatedAt = Date.now();
saveUsers(users);
await syncUserToDb(user).catch(() => {});

console.log('Password updated.');
process.exit(0);
