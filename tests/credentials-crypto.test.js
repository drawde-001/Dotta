/**
 * tests/credentials-crypto.test.js
 *
 * Verifies Part 1: Database & Crypto
 * - AES-256-GCM encryption/decryption with unique 12-byte IV per record.
 * - Key rotation through key_version.
 * - Auth tag tamper detection.
 * - API key masking (last 4 characters only).
 * - DB secret storage and disconnect cleanup.
 */

import assert from 'assert';
import crypto from 'crypto';
import {
  encryptCredentialsPayload,
  decryptCredentialsPayload,
  maskApiKey,
  getEncryptionKey
} from '../src/core/auth/crypto.js';
import {
  saveUserCredentialsSecret,
  getUserCredentialsSecret,
  saveUserIntegration,
  getUserIntegration,
  listUserIntegrations,
  deleteUserCredentials
} from '../src/core/db/supabase.js';

console.log('=== [Part 1 Test] AES-256-GCM Crypto & Credential Secret Storage ===\n');

// 1. Encryption generates unique nonces for identical plaintexts
console.log('1. Testing AES-256-GCM encryption & random nonce uniqueness...');
const testPayload = {
  apiKey: 'meta_mock_secret_key_1234567890abcdef',
  provider: 'meta'
};

const enc1 = encryptCredentialsPayload(testPayload);
const enc2 = encryptCredentialsPayload(testPayload);

assert.notStrictEqual(enc1, enc2, 'Two encryptions of the same payload MUST produce different ciphertexts (unique IV)');

const parsed1 = JSON.parse(enc1);
const parsed2 = JSON.parse(enc2);
assert.notStrictEqual(parsed1.iv, parsed2.iv, 'IVs must be distinct per record');
assert.strictEqual(Buffer.from(parsed1.iv, 'hex').length, 12, 'IV must be 12 bytes (96-bit)');
assert.strictEqual(Buffer.from(parsed1.tag, 'hex').length, 16, 'Auth tag must be 16 bytes');
console.log('✓ Random nonce uniqueness verified.');

// 2. Decryption recovers exact payload
console.log('2. Testing payload recovery...');
const decrypted = decryptCredentialsPayload(enc1);
assert.deepStrictEqual(decrypted, testPayload, 'Decrypted payload must match original object');
console.log('✓ Plaintext successfully recovered.');

// 3. Tamper detection
console.log('3. Testing tampering detection (authentication tag validation)...');
const tamperedPayload = { ...parsed1, ct: parsed1.ct.slice(0, -2) + (parsed1.ct.slice(-2) === 'aa' ? 'bb' : 'aa') };
assert.throws(() => {
  decryptCredentialsPayload(JSON.stringify(tamperedPayload));
}, /Unsupported state or unable to authenticate data|bad decrypt/i, 'Tampered ciphertext must fail authentication');

const tamperedTag = { ...parsed1, tag: '00'.repeat(16) };
assert.throws(() => {
  decryptCredentialsPayload(JSON.stringify(tamperedTag));
}, /Unsupported state or unable to authenticate data|bad decrypt/i, 'Tampered auth tag must fail authentication');
console.log('✓ Tamper detection verified.');

// 4. Key rotation via key_version
console.log('4. Testing key rotation...');
process.env.CREDENTIALS_ENCRYPTION_KEY_V2 = crypto.randomBytes(32).toString('hex');
const encV2 = encryptCredentialsPayload(testPayload, 2);
const parsedV2 = JSON.parse(encV2);
assert.strictEqual(parsedV2.v, 2, 'Key version 2 must be recorded in envelope');
const decV2 = decryptCredentialsPayload(encV2);
assert.deepStrictEqual(decV2, testPayload, 'Decryption with version 2 must recover payload');
console.log('✓ Key rotation verified.');

// 5. Masking
console.log('5. Testing API key masking...');
assert.strictEqual(maskApiKey('sk-meta-test-1234567890'), '...7890', 'Must return only last 4 chars');
assert.strictEqual(maskApiKey('abcd'), '...abcd', 'Short keys must show ... prefix');
assert.strictEqual(maskApiKey(''), '', 'Empty key returns empty');
assert.strictEqual(maskApiKey(null), '', 'Null key returns empty');
console.log('✓ Key masking verified: only last 4 chars exposed.');

// 6. DB secret storage & Disconnect
console.log('6. Testing user credentials secret storage and disconnect...');
const testUserId = `user-test-${Date.now()}`;
const secretData = {
  apiKey: 'mock-key-for-test-9999',
  provider: 'meta'
};
const encSecret = encryptCredentialsPayload(secretData);

// Save secret
await saveUserCredentialsSecret({
  userId: testUserId,
  provider: 'meta',
  encryptedPayload: encSecret,
  keyVersion: 1
});

// Save integration status
await saveUserIntegration({
  userId: testUserId,
  provider: 'meta',
  status: 'connected',
  maskedHint: maskApiKey(secretData.apiKey),
  verifiedAt: new Date().toISOString()
});

// Verify secret retrieval
const retrieved = await getUserCredentialsSecret(testUserId, 'meta');
assert.ok(retrieved, 'Secret record must exist');
assert.strictEqual(retrieved.encryptedPayload, encSecret, 'Ciphertext in DB must match encrypted payload');
const decryptedSecret = decryptCredentialsPayload(retrieved.encryptedPayload);
assert.deepStrictEqual(decryptedSecret, secretData, 'Decrypted secret must match original data');

// Verify integration status retrieval (as user would see)
const integration = await getUserIntegration(testUserId, 'meta');
assert.strictEqual(integration.status, 'connected');
assert.strictEqual(integration.maskedHint, '...9999');
assert.ok(!('apiKey' in integration), 'Integration status MUST NEVER return raw key');
assert.ok(!('encryptedPayload' in integration), 'Integration status MUST NOT contain ciphertext');

// Verify Disconnect
await deleteUserCredentials(testUserId, 'meta');
const secretAfterDelete = await getUserCredentialsSecret(testUserId, 'meta');
assert.strictEqual(secretAfterDelete, null, 'Secret must be deleted after disconnect');

const integrationAfterDelete = await getUserIntegration(testUserId, 'meta');
assert.strictEqual(integrationAfterDelete.status, 'not_configured', 'Status must reset to not_configured');
assert.strictEqual(integrationAfterDelete.maskedHint, null, 'Masked hint must be cleared');
console.log('✓ Secret storage and disconnect lifecycle verified.');

console.log('\n=== ALL PART 1 CRYPTO & DATABASE TESTS PASSED SUCCESSFULLY ===');
