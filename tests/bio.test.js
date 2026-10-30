import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.AGENT_BIO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-test-'));

const store = await import('../src/core/bio/store.js');
const { executeBioIndex, executeBioGet, resolveBioWrite } = await import(
  '../src/core/bio/executors.js'
);
const { checkPermission } = await import('../src/core/tools/policy.js');

let passed = 0;
function check(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  passed++;
  console.log(`ok - ${name}`);
}

const A = 'user-alice-001';
const B = 'user-bob-002';
const THREAD = 'thread-test-1';

// Grants default OFF (both switches) on a fresh profile
const bioA = store.loadUserBio(A);
check('seeded profile exists', bioA.profiles.length === 1);
check('grants default off', bioA.profiles[0].grants.read === false && bioA.profiles[0].grants.write === false);

// bio_index never returns values
const indexOut = executeBioIndex({ userId: A });
check('index has field labels', indexOut.includes('fullName') && indexOut.includes('Personal website'));
check('index leaks no values', !indexOut.includes('alexmorgan.dev') && !indexOut.includes('San Francisco'));

// Policy: denied read/write without grants
check('policy denies read without grant', checkPermission('bio_get', { field_ids: ['role'] }, 'turbo', null, { bio: { userId: A, read: false, write: false } }).decision === 'deny');
check('policy denies write without grant', checkPermission('bio_propose_write', { field_id: 'address', answer_id: 'x' }, 'turbo', null, { bio: { userId: A, read: false, write: false } }).decision === 'deny');
check('policy denies without user', checkPermission('bio_index', {}, 'turbo', null, { bio: {} }).decision === 'deny');
check('approval cache cannot bypass BIO write gate', checkPermission('bio_propose_write', { field_id: 'address', answer_id: 'x' }, 'turbo', new Set(['*']), { bio: { userId: A, read: true, write: false } }).decision === 'deny');
check('policy asks for write approval when write on', checkPermission('bio_propose_write', { field_id: 'address', answer_id: 'x' }, 'turbo', null, { bio: { userId: A, read: true, write: true } }).decision === 'ask');
check('policy allows read when read on', checkPermission('bio_get', { field_ids: ['role'] }, 'turbo', null, { bio: { userId: A, read: true, write: false } }).decision === 'allow');

// Cross-profile attempt denied at executor level
const activeA = store.getActiveProfile(A);
const deniedCross = executeBioGet({ userId: A, fieldIds: ['role'], profileId: 'profile-someone-else' });
check('cross-profile bio_get denied', deniedCross.includes('not the active profile'));
const okGet = executeBioGet({ userId: A, fieldIds: ['role'] });
check('bio_get returns requested value only', okGet.includes('Lead AI Systems Architect') && !okGet.includes('San Francisco'));

// Writes only from stored user answers (prompt-injection cannot supply value)
const noAnswer = resolveBioWrite({ userId: A, threadId: THREAD, fieldId: 'address', answerId: 'answer-forged-from-page' });
check('write without stored answer denied', noAnswer.ok === false);
const rec = store.recordBioAnswer(A, THREAD, { question: 'What is your address?', answer: '12 Demo Street, Lagos' });
const resolved = resolveBioWrite({ userId: A, threadId: THREAD, fieldId: 'address', answerId: rec.id });
check('write resolves from stored answer', resolved.ok === true && resolved.value === '12 Demo Street, Lagos');
// Answer from another thread must not resolve
const wrongThread = resolveBioWrite({ userId: A, threadId: 'thread-other', fieldId: 'address', answerId: rec.id });
check('answer from another thread denied', wrongThread.ok === false);
// Proposal apply writes exactly the stored answer
store.createBioProposal(A, { threadId: THREAD, profileId: activeA.id, fieldId: 'address', value: resolved.value });
store.applyBioProposal(A, THREAD);
check('approved proposal saved the user answer', store.getActiveProfile(A).fields.address === '12 Demo Street, Lagos');

// Cross-user isolation: B never sees A's saved value
check('user B cannot see user A data', store.getActiveProfile(B).fields.address !== '12 Demo Street, Lagos');
store.setField(B, activeBId(), 'address', '99 Other Road');
function activeBId() { return store.getActiveProfile(B).id; }
check('user A data unchanged by B write', store.getActiveProfile(A).fields.address === '12 Demo Street, Lagos');

console.log(`\nBIO TESTS PASSED (${passed} checks)`);
