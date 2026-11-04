/**
 * tests/media-hardgate.test.js
 *
 * Verifies that:
 * 1. POST /api/transcribe blocks with HTTP 403 KEY_REQUIRED when the user has no Meta key.
 * 2. POST /api/attachments/process blocks with HTTP 403 KEY_REQUIRED when audio attachments are submitted without a user Meta key.
 * 3. Zero server environment keys are used to subsidize or bypass a missing user key.
 * 4. Configured users with a decrypted Meta key pass the hard gate.
 */

import assert from 'assert';
import http from 'http';
import {
  saveUserCredentialsSecret,
  deleteUserCredentials
} from '../src/core/db/supabase.js';
import { encryptCredentialsPayload } from '../src/core/auth/crypto.js';

console.log('=== Starting Media Hard Gate & 100% Meta Model Runtime Verification ===\n');

// Start backend server for tests if not already running
let serverModule;
let serverPort = 3099;
process.env.PORT = String(serverPort);
// Ensure operator fallback is explicitly false
process.env.ALLOW_OPERATOR_KEY_FALLBACK = 'false';
delete process.env.META_MUSE_API_KEY;
delete process.env.MUSE_API_KEY;
delete process.env.MODEL_API_KEY;

// Spawn server dynamically
const { default: expressApp } = await import('../server/index.js').catch((err) => {
  // If server already started on port, proceed
  return { default: null };
});

const baseUrl = `http://localhost:${serverPort}`;

// Helper: send POST request
async function postJson(path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

// [Test 1] POST /api/transcribe without user session
console.log('[Test 1] Testing /api/transcribe without session credentials...');
const noUserRes = await postJson('/api/transcribe', {
  audio: 'data:audio/wav;base64,UklGRg==',
  durationSec: 5
});
assert.strictEqual(
  noUserRes.status === 401 || noUserRes.status === 403,
  true,
  `Expected 401 or 403, got ${noUserRes.status}`
);
console.log('✓ Unauthenticated request correctly blocked.');

// [Test 2] POST /api/transcribe with user that has NO Meta key
console.log('\n[Test 2] Testing /api/transcribe with unconfigured user (No Meta Key)...');
const unconfiguredUserId = `test-unconfigured-user-${Date.now()}`;
const unconfiguredRes = await postJson(
  '/api/transcribe',
  {
    userId: unconfiguredUserId,
    audio: 'data:audio/wav;base64,UklGRg==',
    durationSec: 5
  },
  { 'x-user-id': unconfiguredUserId }
);

assert.strictEqual(unconfiguredRes.status, 403, 'Must return HTTP 403');
assert.strictEqual(unconfiguredRes.data?.ok, false);
assert.strictEqual(unconfiguredRes.data?.code, 'KEY_REQUIRED');
assert.ok(
  unconfiguredRes.data?.error?.includes('Meta API key is required'),
  'Must include clear message instructing user to configure key'
);
console.log('✓ Hard gate verified: Returned HTTP 403 KEY_REQUIRED when user has no key.');

// [Test 3] POST /api/attachments/process with audio attachment and no key
console.log('\n[Test 3] Testing /api/attachments/process with audio attachment and unconfigured user...');
const audioAttachmentRes = await postJson(
  '/api/attachments/process',
  {
    userId: unconfiguredUserId,
    attachments: [
      {
        order: 1,
        name: 'voice-note.wav',
        type: 'audio/wav',
        size: 1024,
        dataUrl: 'data:audio/wav;base64,UklGRg=='
      }
    ]
  },
  { 'x-user-id': unconfiguredUserId }
);

assert.strictEqual(audioAttachmentRes.status, 403, 'Audio attachment must return HTTP 403');
assert.strictEqual(audioAttachmentRes.data?.code, 'KEY_REQUIRED');
console.log('✓ Hard gate verified: Audio attachment rejected with HTTP 403 KEY_REQUIRED.');

// [Test 4] User with configured Meta key passes the hard gate
console.log('\n[Test 4] Testing user with configured Meta credentials passes the hard gate...');
const configuredUserId = `test-configured-user-${Date.now()}`;
const mockMetaKey = 'meta-key-test-abc123xyz789';

await saveUserCredentialsSecret({
  userId: configuredUserId,
  provider: 'meta',
  encryptedPayload: encryptCredentialsPayload({ apiKey: mockMetaKey, provider: 'meta' })
});

// Setting NODE_ENV=test allows transcribeAudioSequentially to resolve mockText without actual network call
process.env.NODE_ENV = 'test';
const configuredRes = await postJson(
  '/api/transcribe',
  {
    userId: configuredUserId,
    audio: 'data:audio/wav;base64,UklGRg==',
    durationSec: 5,
    mockText: 'Hello from muse-voice-transcribe-1.0'
  },
  { 'x-user-id': configuredUserId }
);

assert.strictEqual(configuredRes.status, 200, 'Configured user must succeed');
assert.strictEqual(configuredRes.data?.ok, true);
assert.strictEqual(configuredRes.data?.transcript, 'Hello from muse-voice-transcribe-1.0');
console.log('✓ Configured user successfully passed the hard gate and transcribed audio.');

// Clean up
await deleteUserCredentials(configuredUserId, 'meta').catch(() => {});

console.log('\n======================================================');
console.log('ALL MEDIA HARD GATE INTEGRATION TESTS PASSED!');
console.log('======================================================\n');
process.exit(0);
