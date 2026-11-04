/**
 * tests/supabase-database.test.js
 *
 * Verifies Supabase Database integration across all tables:
 * - public.users & public.user_profiles
 * - public.user_credentials_secret
 * - public.user_integrations
 * - public.user_bio_vaults
 * - public.user_uploads
 * - public.conversations
 */

import assert from 'assert';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

import {
  getSupabaseClient,
  isSupabaseConfigured,
  ensureDbUser,
  syncUserToDb,
  getDbUserByEmail,
  saveUserCredentialsSecret,
  getUserCredentialsSecret,
  saveUserIntegration,
  getUserIntegration,
  listUserIntegrations,
  deleteUserCredentials,
  saveDbBioVault,
  getDbBioVault,
  recordDbUserUpload,
  listDbUserUploads,
  saveDbConversation,
  getDbConversation,
  listDbConversations,
  deleteDbConversation
} from '../src/core/db/supabase.js';
import {
  encryptCredentialsPayload,
  decryptCredentialsPayload,
  maskApiKey
} from '../src/core/auth/crypto.js';

console.log('--- Starting Supabase Database Integration Tests ---\n');

const testUserId = `test-user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const testEmail = `${testUserId}@example.com`;
const testThreadId = `test-thread-${Date.now()}`;

async function run() {
  const sb = getSupabaseClient();
  assert(sb, 'Supabase client must be initialized');
  assert(isSupabaseConfigured(), 'isSupabaseConfigured() must be true');
  console.log('✓ Supabase client initialized and connected\n');

  // 1. Users and Profiles
  console.log('[Test 1] Testing public.users and public.user_profiles...');
  const ensuredId = await ensureDbUser(testUserId, {
    email: testEmail,
    name: 'Test Database User'
  });
  assert.strictEqual(ensuredId, testUserId, 'ensureDbUser should return the clean userId');

  const fetchedUser = await getDbUserByEmail(testEmail);
  assert(fetchedUser, 'User must be retrievable by email');
  assert.strictEqual(fetchedUser.id, testUserId, 'Fetched user ID must match');
  console.log('✓ User and profile upsert & retrieval verified\n');

  // 2. Encrypted User Credentials Secret
  console.log('[Test 2] Testing public.user_credentials_secret...');
  const rawKey = 'sk-meta-test-secret-key-1234567890';
  const encryptedPayload = encryptCredentialsPayload({
    apiKey: rawKey,
    provider: 'meta'
  });

  const secretSaved = await saveUserCredentialsSecret({
    userId: testUserId,
    provider: 'meta',
    encryptedPayload,
    keyVersion: 1
  });
  assert.strictEqual(secretSaved, true, 'saveUserCredentialsSecret must succeed');

  const fetchedSecret = await getUserCredentialsSecret(testUserId, 'meta');
  assert(fetchedSecret, 'Secret must be retrieved');
  assert.strictEqual(fetchedSecret.encryptedPayload, encryptedPayload, 'Encrypted payload must match');

  const decrypted = decryptCredentialsPayload(fetchedSecret.encryptedPayload);
  assert.strictEqual(decrypted.apiKey, rawKey, 'Decrypted key must match original');
  console.log('✓ Encrypted credentials secret storage & decryption verified\n');

  // 3. User Integrations Status
  console.log('[Test 3] Testing public.user_integrations...');
  const intSaved = await saveUserIntegration({
    userId: testUserId,
    provider: 'meta',
    status: 'connected',
    maskedHint: maskApiKey(rawKey)
  });
  assert.strictEqual(intSaved, true, 'saveUserIntegration must succeed');

  const fetchedInt = await getUserIntegration(testUserId, 'meta');
  assert(fetchedInt, 'Integration record must be retrieved');
  assert.strictEqual(fetchedInt.status, 'connected', 'Status must be connected');
  assert(fetchedInt.maskedHint.includes('...'), 'Masked hint must mask the key');

  const userIntegrationsList = await listUserIntegrations(testUserId);
  assert(Array.isArray(userIntegrationsList), 'listUserIntegrations must return array');
  const metaEntry = userIntegrationsList.find((i) => i.provider === 'meta');
  assert(metaEntry && metaEntry.status === 'connected', 'Meta integration must be connected');
  console.log('✓ User integrations management verified\n');

  // 4. User BIO Vaults
  console.log('[Test 4] Testing public.user_bio_vaults...');
  const testBioDoc = {
    userId: testUserId,
    profiles: [
      {
        id: 'profile-alex-default',
        name: 'Alex Morgan (Default)',
        isActive: true,
        grants: { read: false, write: false },
        fields: {
          fullName: 'Alex Morgan',
          email: 'alex.morgan@example.com',
          role: 'Lead AI Systems Architect'
        },
        entries: []
      }
    ],
    proposals: [],
    answers: []
  };

  const bioSaved = await saveDbBioVault(testUserId, testBioDoc);
  assert.strictEqual(bioSaved, true, 'saveDbBioVault must succeed');

  const fetchedBio = await getDbBioVault(testUserId);
  assert(fetchedBio, 'BIO vault must be retrieved from Supabase');
  assert.strictEqual(fetchedBio.profiles.length, 1, 'Vault must contain 1 profile');
  assert.strictEqual(fetchedBio.profiles[0].fields.fullName, 'Alex Morgan', 'Profile fullName must match');
  console.log('✓ User BIO vault persistence & retrieval verified\n');

  // 5. User Uploads / Attachments
  console.log('[Test 5] Testing public.user_uploads...');
  const uploadId = `upload-${Date.now()}`;
  const uploadRecorded = await recordDbUserUpload({
    id: uploadId,
    userId: testUserId,
    threadId: testThreadId,
    name: 'resume.pdf',
    size: 1048576,
    type: 'application/pdf',
    workspacePath: 'bio/resume.pdf',
    metadata: { category: 'bio_cv' }
  });
  assert(uploadRecorded, 'recordDbUserUpload must return record');

  const uploads = await listDbUserUploads(testUserId);
  assert(Array.isArray(uploads), 'listDbUserUploads must return array');
  const matchingUpload = uploads.find((u) => u.id === uploadId);
  assert(matchingUpload, 'Uploaded file must be in list');
  assert.strictEqual(matchingUpload.name, 'resume.pdf', 'Upload name must match');
  console.log('✓ User file upload tracking in database verified\n');

  // 6. Conversations / Threads
  console.log('[Test 6] Testing public.conversations...');
  const threadData = {
    title: 'Verification Session',
    status: 'regular',
    messages: [
      { id: 'msg-1', role: 'user', content: 'Hello agent' },
      { id: 'msg-2', role: 'assistant', content: 'Hello, how can I help you today?' }
    ]
  };

  await saveDbConversation(testUserId, testThreadId, threadData);

  const fetchedConv = await getDbConversation(testUserId, testThreadId);
  assert(fetchedConv, 'Conversation must be retrieved');
  assert.strictEqual(fetchedConv.title, 'Verification Session', 'Title must match');
  assert.strictEqual(fetchedConv.messages.length, 2, 'Message count must match');

  const convList = await listDbConversations(testUserId);
  assert(Array.isArray(convList), 'listDbConversations must return array');
  assert(convList.some((c) => c.id === testThreadId), 'Thread must be in user conversations');

  const deletedConv = await deleteDbConversation(testUserId, testThreadId);
  assert.strictEqual(deletedConv, true, 'deleteDbConversation must succeed');

  const afterDelete = await getDbConversation(testUserId, testThreadId);
  assert.strictEqual(afterDelete, null, 'Conversation must no longer exist after deletion');
  console.log('✓ Conversations CRUD in database verified\n');

  // 7. Disconnect / Delete Credentials
  console.log('[Test 7] Testing deleteUserCredentials...');
  const deletedCreds = await deleteUserCredentials(testUserId, 'meta');
  assert.strictEqual(deletedCreds, true, 'deleteUserCredentials must succeed');

  const secretAfterDelete = await getUserCredentialsSecret(testUserId, 'meta');
  assert.strictEqual(secretAfterDelete, null, 'Secret must be null after deletion');

  const intAfterDelete = await getUserIntegration(testUserId, 'meta');
  assert.strictEqual(intAfterDelete.status, 'not_configured', 'Integration status must be not_configured');
  console.log('✓ Credential deletion & integration reset verified\n');

  // Clean up test user
  console.log('[Cleanup] Cleaning up test records...');
  try {
    await sb.from('user_uploads').delete().eq('user_id', testUserId);
    await sb.from('user_bio_vaults').delete().eq('user_id', testUserId);
    await sb.from('user_integrations').delete().eq('user_id', testUserId);
    await sb.from('user_credentials_secret').delete().eq('user_id', testUserId);
    await sb.from('user_profiles').delete().eq('user_id', testUserId);
    await sb.from('user_settings').delete().eq('user_id', testUserId);
    await sb.from('user_sessions').delete().eq('user_id', testUserId);
    await sb.from('users').delete().eq('id', testUserId);
  } catch (cleanErr) {
    console.warn('Cleanup warning:', cleanErr.message);
  }

  console.log('ALL SUPABASE DATABASE TESTS PASSED!\n');
}

run().catch((err) => {
  console.error('\n❌ DATABASE TEST FAILED:', err);
  process.exit(1);
});
