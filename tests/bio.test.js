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
const deniedCross = await executeBioGet({ userId: A, fieldIds: ['role'], profileId: 'profile-someone-else' });
check('cross-profile bio_get denied', deniedCross.includes('not the active profile'));
const okGet = await executeBioGet({ userId: A, fieldIds: ['role'] });
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

// Audio/video: tailored per-entry grant (general read switch is not enough)
const audioEntry = store.addEntry(A, activeA.id, {
  name: 'Voice Intro',
  type: 'audio',
  description: 'Name pronunciation'
});
const idxAudio = JSON.parse(executeBioIndex({ userId: A }));
const audioIdx = idxAudio.entries.find((e) => e.id === `entry:${audioEntry.id}`);
check('audio not readable by default', audioIdx && audioIdx.readable === false);
const beforeGrant = await executeBioGet({ userId: A, fieldIds: [`entry:${audioEntry.id}`] });
check('audio blocked without entry grant', beforeGrant.includes('has not granted agent access'));
store.updateEntry(A, activeA.id, audioEntry.id, { agentReadable: true });
const afterGrant = await executeBioGet({ userId: A, fieldIds: [`entry:${audioEntry.id}`] });
check(
  'audio readable with tailored grant',
  afterGrant.includes('granted') && !afterGrant.includes('has not granted agent access')
);

// Cross-user isolation: B never sees A's saved value
check('user B cannot see user A data', store.getActiveProfile(B).fields.address !== '12 Demo Street, Lagos');
store.setField(B, activeBId(), 'address', '99 Other Road');
function activeBId() { return store.getActiveProfile(B).id; }
check('user A data unchanged by B write', store.getActiveProfile(A).fields.address === '12 Demo Street, Lagos');

// profile_get is BIO-backed now — never the old hardcoded person
store.updateProfile(A, activeA.id, { grants: { read: true, write: false } });
const { OmniEngine } = await import('../src/core/index.js');
const engine = new OmniEngine({});
const profileOut = await engine.executeTool('profile_get', {}, { userId: A });
check('profile_get has no hardcoded Edward', !profileOut.includes('Edward'));
check('profile_get returns BIO identity', profileOut.includes('Alex Morgan'));
check('profile_get returns BIO email', profileOut.includes('alex.morgan@example.com'));

// PDF documents: agent sees the RAW extracted text
const fsx = await import('fs');
const pathx = await import('path');
const { getUserWorkspaceRoot } = await import('../src/core/execution/workspace.js');
const sandboxRoot = getUserWorkspaceRoot(A);
fsx.mkdirSync(pathx.join(sandboxRoot, 'bio'), { recursive: true });
const pdfBytes = fsx.readFileSync(
  new URL('../node_modules/pdf-parse/test/data/01-valid.pdf', import.meta.url)
);
fsx.writeFileSync(pathx.join(sandboxRoot, 'bio', 'cv-test.pdf'), pdfBytes);
store.setField(A, activeA.id, 'cv', { name: 'cv-test.pdf', size: pdfBytes.length, mime: 'application/pdf', path: 'bio/cv-test.pdf' });
const cvOut = JSON.parse(await executeBioGet({ userId: A, fieldIds: ['cv'] }));
check('CV pdf raw text extracted', (cvOut.values.cv.text || '').includes('Trace-based Just-in-Time'));
check('CV staged for upload', typeof cvOut.uploads?.cv?.uploadRef === 'string' && cvOut.uploads.cv.uploadRef.startsWith('biofile-'));
const { resolveStagedFile } = await import('../src/core/bio/staging.js');
check('uploadRef resolves to sandbox file', !!resolveStagedFile(cvOut.uploads.cv.uploadRef));

// Images: model actually sees the picture (inlineData part collected)
const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=';
fsx.writeFileSync(pathx.join(sandboxRoot, 'bio', 'pic.png'), Buffer.from(pngB64, 'base64'));
const imgEntry = store.addEntry(A, activeA.id, {
  name: 'Headshot',
  type: 'image',
  description: 'Formal headshot',
  file: { name: 'pic.png', size: 68, mime: 'image/png', path: 'bio/pic.png' }
});
const { collectBioMediaParts } = await import('../src/core/bio/executors.js');
const mediaParts = await collectBioMediaParts({ userId: A, fieldIds: [`entry:${imgEntry.id}`] });
check('image collected as model-visible part', mediaParts.length === 1 && mediaParts[0].inlineData?.mimeType === 'image/png');

// Cleanup sandbox artifacts created by this test
fsx.rmSync(sandboxRoot, { recursive: true, force: true });

console.log(`\nBIO TESTS PASSED (${passed} checks)`);
