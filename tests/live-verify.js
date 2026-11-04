/**
 * tests/live-verify.js
 *
 * Verifies live production deployment at https://dotta.duckdns.org:
 * 1. Health check returns 200 with default model muse-spark-open.
 * 2. Authenticated user without Meta key hits HTTP 403 KEY_REQUIRED on /api/transcribe.
 * 3. Authenticated user without Meta key hits HTTP 403 KEY_REQUIRED on /api/attachments/process (audio).
 * 4. Authenticated user without Meta key hits HTTP 403 KEY_REQUIRED on /api/chat.
 * 5. Verifies zero server environment key subsidies on production.
 */

import assert from 'assert';

const LIVE_URL = 'https://dotta.duckdns.org';
console.log(`=== Testing Live Production Deployment at ${LIVE_URL} ===\n`);

// 1. Health check
console.log('1. Checking Live Health...');
const healthRes = await fetch(`${LIVE_URL}/api/health`);
assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200');
const healthJson = await healthRes.json();
assert.strictEqual(healthJson.status, 'healthy');
assert.strictEqual(healthJson.defaultModel, 'muse-spark-open');
console.log(`✓ Live health verified: ${healthJson.status}, default model: ${healthJson.defaultModel}`);

// 2. Sign up a fresh unconfigured user to obtain an authoritative session cookie
console.log('\n2. Registering fresh unconfigured user session on live...');
const testEmail = `tester-${Date.now()}@dotta-test.live`;
const signupRes = await fetch(`${LIVE_URL}/api/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: testEmail,
    password: 'Password123!@#',
    firstName: 'Audit',
    lastName: 'Tester'
  })
});

assert.strictEqual(signupRes.status, 200, 'Signup must succeed');
const signupData = await signupRes.json();
assert.strictEqual(signupData.ok, true);

// Extract session cookie from Set-Cookie header
const setCookieHeader = signupRes.headers.get('set-cookie') || '';
const cookieMatch = setCookieHeader.match(/dotta_session=([^;]+)/);
assert.ok(cookieMatch, 'Must receive dotta_session cookie');
const sessionCookie = `dotta_session=${cookieMatch[1]}`;
console.log(`✓ Session obtained for user ${signupData.user.id}`);

// Helper with cookie
async function postWithSession(path, body) {
  const res = await fetch(`${LIVE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// 3. Audio Transcription Hard Gate on Live
console.log('\n3. Testing Live /api/transcribe Hard Gate with authenticated session...');
const transcribeRes = await postWithSession('/api/transcribe', {
  audio: 'data:audio/wav;base64,UklGRg==',
  durationSec: 5
});

console.log(`Live /api/transcribe status: ${transcribeRes.status}, code: ${transcribeRes.data?.code}`);
assert.strictEqual(transcribeRes.status, 403, 'Must return HTTP 403 Forbidden on live');
assert.strictEqual(transcribeRes.data?.code, 'KEY_REQUIRED', 'Must return KEY_REQUIRED on live');
assert.ok(
  transcribeRes.data?.error?.includes('Meta API key is required'),
  'Error message must specify Meta API key requirement'
);
console.log('✓ Live /api/transcribe verified: strictly enforces HTTP 403 KEY_REQUIRED.');

// 4. Audio Attachment Processing Gate on Live
console.log('\n4. Testing Live /api/attachments/process with Audio Attachment...');
const attachRes = await postWithSession('/api/attachments/process', {
  attachments: [
    {
      order: 1,
      name: 'voice-note.wav',
      type: 'audio/wav',
      size: 1024,
      dataUrl: 'data:audio/wav;base64,UklGRg=='
    }
  ]
});

console.log(`Live /api/attachments/process status: ${attachRes.status}, code: ${attachRes.data?.code}`);
assert.strictEqual(attachRes.status, 403, 'Audio attachment must return HTTP 403 Forbidden on live');
assert.strictEqual(attachRes.data?.code, 'KEY_REQUIRED', 'Must return KEY_REQUIRED on live');
console.log('✓ Live /api/attachments/process verified: strictly enforces HTTP 403 KEY_REQUIRED.');

// 5. Chat Orchestrator Gate on Live
console.log('\n5. Testing Live /api/chat Hard Gate with authenticated session...');
const chatRes = await postWithSession('/api/chat', {
  threadId: `thread-${Date.now()}`,
  instruction: 'Hello Dotta'
});

console.log(`Live /api/chat status: ${chatRes.status}, code: ${chatRes.data?.code}`);
assert.strictEqual(chatRes.status, 403, 'Chat must return HTTP 403 Forbidden on live');
assert.strictEqual(chatRes.data?.code, 'KEY_REQUIRED', 'Must return KEY_REQUIRED on live');
console.log('✓ Live /api/chat verified: strictly enforces HTTP 403 KEY_REQUIRED.');

console.log('\n===============================================================');
console.log('ALL LIVE PRODUCTION TESTS PASSED (100% HARD GATE VERIFIED LIVE)');
console.log('===============================================================\n');
