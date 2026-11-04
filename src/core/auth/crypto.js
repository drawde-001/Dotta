/**
 * src/core/auth/crypto.js
 *
 * Secure application-level encryption for user provider credentials.
 * Implements AES-256-GCM with a unique 12-byte random IV/nonce per record,
 * 16-byte authentication tag, and key rotation support via key_version.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_KEY_VERSION = 1;

/**
 * Resolve the 32-byte master encryption key for a given key version.
 * Checks process.env.CREDENTIALS_ENCRYPTION_KEY_V{version} or
 * process.env.CREDENTIALS_ENCRYPTION_KEY.
 */
export function getEncryptionKey(version = DEFAULT_KEY_VERSION) {
  const specificKeyName = `CREDENTIALS_ENCRYPTION_KEY_V${version}`;
  let rawKey = process.env[specificKeyName] || (version === DEFAULT_KEY_VERSION ? process.env.CREDENTIALS_ENCRYPTION_KEY : null);

  if (rawKey && typeof rawKey === 'string') {
    rawKey = rawKey.trim();
    // Support 64-char hex string
    if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
      return Buffer.from(rawKey, 'hex');
    }
    // Support base64 or direct 32-byte string
    if (rawKey.length === 32) {
      return Buffer.from(rawKey, 'utf8');
    }
    // Derive a standard 32-byte key using SHA-256
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  // Fallback for local testing / development if no key is supplied in environment
  const fallbackSecretPath = path.resolve(__dirname, '../../data/.credentials-key');
  try {
    if (fs.existsSync(fallbackSecretPath)) {
      const stored = fs.readFileSync(fallbackSecretPath, 'utf8').trim();
      if (stored.length === 64) {
        return Buffer.from(stored, 'hex');
      }
    }
  } catch {}

  const generated = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(fallbackSecretPath), { recursive: true });
    fs.writeFileSync(fallbackSecretPath, generated.toString('hex'), 'utf8');
  } catch {}
  return generated;
}

/**
 * Encrypt a JSON-serializable credentials payload with AES-256-GCM.
 *
 * @param {object|string} payload The sensitive credentials to encrypt.
 * @param {number} [keyVersion=1] The key version to use.
 * @returns {string} Serialized JSON containing version, IV, auth tag, and ciphertext.
 */
export function encryptCredentialsPayload(payload, keyVersion = DEFAULT_KEY_VERSION) {
  if (payload === null || payload === undefined) {
    throw new Error('[Crypto] Cannot encrypt null or undefined payload');
  }

  const plainText = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const key = getEncryptionKey(keyVersion);
  const iv = crypto.randomBytes(12); // Standard 96-bit nonce for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(plainText, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    v: keyVersion,
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    ct: ciphertext
  });
}

/**
 * Decrypt an AES-256-GCM encrypted credentials string.
 *
 * @param {string} encryptedString Serialized JSON returned by encryptCredentialsPayload.
 * @returns {any} The parsed plaintext object or string.
 */
export function decryptCredentialsPayload(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') {
    throw new Error('[Crypto] Invalid encrypted string');
  }

  let envelope;
  try {
    envelope = JSON.parse(encryptedString);
  } catch {
    throw new Error('[Crypto] Malformed encrypted payload envelope');
  }

  const { v = DEFAULT_KEY_VERSION, iv, tag, ct } = envelope;
  if (!iv || !tag || !ct) {
    throw new Error('[Crypto] Incomplete encrypted envelope (missing iv, tag, or ct)');
  }

  const key = getEncryptionKey(v);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(ct, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}

/**
 * Produce a safe masked hint exposing only the last 4 characters.
 * Example: 'sk-meta-1234567890' -> '...7890'
 *
 * @param {string} key
 * @returns {string}
 */
export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length <= 4) return `...${trimmed}`;
  return `...${trimmed.slice(-4)}`;
}
