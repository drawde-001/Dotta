/**
 * tests/settings-verification.test.js
 *
 * Verifies Part 2 & Part 3:
 * - SSRF protection (assertSafeExternalUrl blocks loopback, private ranges, metadata IPs, non-HTTPS).
 * - Friendly error mapping (Meta & Modal error sanitization).
 * - Verification flow and rate limiting.
 */

import assert from 'assert';
import {
  isPrivateOrRestrictedIp,
  assertSafeExternalUrl,
  mapMetaError,
  verifyMetaCredentials,
  verifyModalCredentials
} from '../src/core/auth/verify-provider.js';

console.log('=== [Part 2 & 3 Test] Verification Probes & SSRF Defense ===\n');

// 1. SSRF IP Checking
console.log('1. Testing restricted IP check (loopback, private, metadata)...');
assert.strictEqual(isPrivateOrRestrictedIp('127.0.0.1'), true, '127.0.0.1 must be restricted');
assert.strictEqual(isPrivateOrRestrictedIp('10.0.1.25'), true, '10.0.0.0/8 must be restricted');
assert.strictEqual(isPrivateOrRestrictedIp('172.16.0.5'), true, '172.16.0.0/12 must be restricted');
assert.strictEqual(isPrivateOrRestrictedIp('172.31.255.254'), true, '172.31.255.254 must be restricted');
assert.strictEqual(isPrivateOrRestrictedIp('192.168.1.1'), true, '192.168.0.0/16 must be restricted');
assert.strictEqual(isPrivateOrRestrictedIp('169.254.169.254'), true, 'AWS metadata IP 169.254.169.254 must be restricted');
assert.strictEqual(isPrivateOrRestrictedIp('::1'), true, 'IPv6 loopback must be restricted');
assert.strictEqual(isPrivateOrRestrictedIp('8.8.8.8'), false, 'Public IP 8.8.8.8 must not be restricted');
assert.strictEqual(isPrivateOrRestrictedIp('104.21.50.2'), false, 'Public IP must not be restricted');
console.log('✓ IP classification verified.');

// 2. Strict URL SSRF Shield
console.log('2. Testing URL SSRF shield...');
// Non-HTTPS
await assert.rejects(
  () => assertSafeExternalUrl('http://modal.run/endpoint'),
  /Only secure HTTPS endpoints/i,
  'HTTP URLs must be rejected'
);

// Localhost / internal
await assert.rejects(
  () => assertSafeExternalUrl('https://localhost:8080/v1'),
  /Local and internal network/i,
  'localhost must be rejected'
);
await assert.rejects(
  () => assertSafeExternalUrl('https://my-host.internal/chat'),
  /Local and internal network/i,
  '.internal must be rejected'
);
await assert.rejects(
  () => assertSafeExternalUrl('https://169.254.169.254/latest/meta-data'),
  /Private, loopback, or cloud metadata/i,
  'Cloud metadata IP must be rejected'
);
await assert.rejects(
  () => assertSafeExternalUrl('https://127.0.0.1:4000/v1'),
  /Private, loopback, or cloud metadata/i,
  '127.0.0.1 must be rejected'
);
await assert.rejects(
  () => assertSafeExternalUrl('https://10.10.10.10/v1'),
  /Private, loopback, or cloud metadata/i,
  '10.x.x.x must be rejected'
);

// Valid public HTTPS URL
const validUrl = await assertSafeExternalUrl('https://my-org--spark-open.modal.run/chat/completions');
assert.strictEqual(validUrl, 'https://my-org--spark-open.modal.run/chat/completions');
console.log('✓ URL SSRF shield verified.');

// 3. Error Mapping
console.log('3. Testing error mapping (sanitization)...');
const e401 = mapMetaError(401, '{"error":"invalid_api_key"}');
assert.strictEqual(e401.code, 'INVALID_KEY');
assert.ok(e401.message.includes('Invalid Meta API key'));

const e402 = mapMetaError(402, '{"error":"insufficient_quota"}');
assert.strictEqual(e402.code, 'INSUFFICIENT_CREDITS');

const e429 = mapMetaError(429, 'rate limit exceeded');
assert.strictEqual(e429.code, 'RATE_LIMITED');
console.log('✓ Error mapping verified.');

// 4. Modal Verification Probe with SSRF prevention
console.log('4. Testing Modal probe SSRF prevention...');
const ssrfProbeRes = await verifyModalCredentials({
  endpointUrl: 'http://169.254.169.254/latest/meta-data',
  tokenId: 'tok-id',
  tokenSecret: 'tok-secret'
});
assert.strictEqual(ssrfProbeRes.ok, false);
assert.strictEqual(ssrfProbeRes.code, 'SSRF_BLOCKED');
console.log('✓ Modal SSRF defense blocked cloud metadata endpoint probe.');

console.log('\n=== ALL PART 2 & 3 TESTS PASSED SUCCESSFULLY ===');
