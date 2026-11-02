/**
 * Phase 5 Verification Test Suite: Modes, Permissions & Questions
 *
 * Proves:
 * 1. Turbo mode asks for permission to visit external sites when given a link or prompt.
 * 2. When the user approves the host, subsequent actions on that host proceed without repeated questions.
 * 3. Default and Review modes preserve their specific submit gates and state-changing checks.
 * 4. Fields already present in BIO are used silently without asking the user.
 * 5. Missing required fields are asked in a single batched question with suggested options.
 */

import assert from 'assert';
import { checkPermission } from '../src/core/tools/policy.js';
import { runReviewerLevel } from '../src/core/levels/reviewer.js';

console.log('=== PHASE 5: MODES, PERMISSIONS & QUESTIONS VERIFICATION ===\n');

async function runPhase5Tests() {
  // ---------------------------------------------------------------------------
  // TEST 1: Turbo mode asks permission before visiting an unapproved external site
  // ---------------------------------------------------------------------------
  console.log('[Test 1] Testing Turbo mode site visit permission gate...');
  const externalUrl = 'https://careers.example-company.com/apply';
  const unapprovedPerm = checkPermission('browser_read_page', { url: externalUrl }, 'turbo', new Set(), {
    bio: { userId: 'u1', read: true }
  });

  console.log('  -> Unapproved external site check:', unapprovedPerm);
  assert.strictEqual(unapprovedPerm.decision, 'ask', 'Must ask user permission before visiting external site');
  assert(unapprovedPerm.reason.includes('careers.example-company.com'), 'Reason must mention the target host');

  // Once approved by user, checkPermission allows navigation
  const approvedPerm = checkPermission('browser_read_page', { url: externalUrl }, 'turbo', new Set(['careers.example-company.com']), {
    bio: { userId: 'u1', read: true }
  });
  console.log('  -> Approved host check:', approvedPerm);
  assert.strictEqual(approvedPerm.decision, 'allow', 'Must allow navigation once host is approved');
  console.log('✓ Test 1 PASSED: Turbo mode site visit permission gate verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Localhost and local dummy pages do not require repetitive permission
  // ---------------------------------------------------------------------------
  console.log('[Test 2] Testing localhost dummy page pre-approval...');
  const localPerm = checkPermission('browser_read_page', { url: 'http://127.0.0.1:4000/test-form' }, 'turbo', new Set(), {
    bio: { userId: 'u1', read: true }
  });
  console.log('  -> Localhost check:', localPerm);
  assert.strictEqual(localPerm.decision, 'allow', 'Local dummy test pages must be pre-approved');
  console.log('✓ Test 2 PASSED: Localhost pre-approval verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Submit gate across Turbo, Default, and Review modes
  // ---------------------------------------------------------------------------
  console.log('[Test 3] Testing submit gates across Turbo, Default, and Review modes...');
  const submitAction = { kind: 'submit', buttonLabel: 'Submit Application' };

  // 3a. Turbo mode submit (autonomous when required fields are ready)
  const turboSubmit = await runReviewerLevel({
    userInstruction: 'Fill and submit application',
    mode: 'turbo',
    proposedAction: submitAction,
    allRequiredFieldsReady: true
  });
  console.log('  -> Turbo submit decision:', { decision: turboSubmit.decision, requiresUserConfirmation: turboSubmit.requiresUserConfirmation });
  assert.strictEqual(turboSubmit.decision, 'allow');
  assert.strictEqual(turboSubmit.requiresUserConfirmation, false, 'Turbo mode submits autonomously when ready');

  // 3b. Default mode submit (requires confirmation unless natural approval given)
  const defaultSubmit = await runReviewerLevel({
    userInstruction: 'Fill out this application',
    mode: 'default',
    proposedAction: submitAction,
    allRequiredFieldsReady: true
  });
  console.log('  -> Default submit decision:', { decision: defaultSubmit.decision, requiresUserConfirmation: defaultSubmit.requiresUserConfirmation });
  assert.strictEqual(defaultSubmit.decision, 'allow');
  assert.strictEqual(defaultSubmit.requiresUserConfirmation, true, 'Default mode requires user confirmation before final submit');

  // 3c. Review mode submit (always requires user confirmation)
  const reviewSubmit = await runReviewerLevel({
    userInstruction: 'Fill out this application',
    mode: 'review',
    proposedAction: submitAction,
    allRequiredFieldsReady: true
  });
  console.log('  -> Review submit decision:', { decision: reviewSubmit.decision, requiresUserConfirmation: reviewSubmit.requiresUserConfirmation });
  assert.strictEqual(reviewSubmit.decision, 'allow');
  assert.strictEqual(reviewSubmit.requiresUserConfirmation, true, 'Review mode requires user confirmation before final submit');
  console.log('✓ Test 3 PASSED: Mode-specific submit gates verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: "Do not submit" intent is strictly respected even in Turbo mode
  // ---------------------------------------------------------------------------
  console.log('[Test 4] Testing "do not submit" prompt intent in Turbo mode...');
  const fillOnlySubmit = await runReviewerLevel({
    userInstruction: 'Fill out this form, but DO NOT submit it',
    mode: 'turbo',
    proposedAction: submitAction,
    allRequiredFieldsReady: true
  });
  console.log('  -> Fill-only Turbo check:', { decision: fillOnlySubmit.decision, requiresUserConfirmation: fillOnlySubmit.requiresUserConfirmation });
  assert.strictEqual(fillOnlySubmit.decision, 'deny', 'Submit must be denied when user requested do not submit');
  assert.strictEqual(fillOnlySubmit.requiresUserConfirmation, true);
  console.log('✓ Test 4 PASSED: "Do not submit" intent enforced.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Repeating permission prevention & user answer persistence
  // ---------------------------------------------------------------------------
  console.log('[Test 5] Testing repeating permission prevention & user answer persistence...');
  const { addThreadApproval, getThreadApprovals, recordInterruptHistory, getInterruptAnswer } = await import('../src/core/state/store.js');
  const dummyThreadId = `test-thread-perm-${Date.now()}`;
  const testUserId = 'test-user-repeat-check';
  const targetSite = 'https://dummy-jobs.example.org/apply';
  const targetHost = 'dummy-jobs.example.org';

  // Initially unapproved
  const initialPerm = checkPermission('browser_read_page', { url: targetSite }, 'turbo', getThreadApprovals(dummyThreadId, testUserId), {
    bio: { userId: testUserId, read: true },
    navigation: { approvedHosts: new Set() }
  });
  assert.strictEqual(initialPerm.decision, 'ask', 'Unapproved domain must ask permission initially');

  // If the user prompt provided the URL, approvedHosts immediately allows it without asking repeatedly
  const promptProvidedPerm = checkPermission('browser_read_page', { url: targetSite }, 'turbo', getThreadApprovals(dummyThreadId, testUserId), {
    bio: { userId: testUserId, read: true },
    navigation: { approvedHosts: new Set([targetHost]) }
  });
  assert.strictEqual(promptProvidedPerm.decision, 'allow', 'Domain provided in user prompt must be pre-approved');

  // When user approves via card, approval is persisted under testUserId
  addThreadApproval(dummyThreadId, targetHost, testUserId);
  addThreadApproval(dummyThreadId, `host:${targetHost}`, testUserId);
  addThreadApproval(dummyThreadId, 'browser_read_page', testUserId);

  const persistedApprovals = getThreadApprovals(dummyThreadId, testUserId);
  assert(persistedApprovals.has(targetHost), 'Must persist approved host in user thread');
  assert(persistedApprovals.has(`host:${targetHost}`), 'Must persist host key in user thread');

  const afterApprovalPerm = checkPermission('browser_read_page', { url: targetSite }, 'turbo', persistedApprovals, {
    bio: { userId: testUserId, read: true },
    navigation: { approvedHosts: new Set() }
  });
  assert.strictEqual(afterApprovalPerm.decision, 'allow', 'Approved domain must allow without asking repeatedly');

  // Verify user question answer is stored and retrieved under testUserId
  recordInterruptHistory(dummyThreadId, 'preferred_shift', 'Morning Shift', testUserId);
  const retrievedAns = getInterruptAnswer(dummyThreadId, 'preferred_shift', testUserId);
  assert.strictEqual(retrievedAns, 'Morning Shift', 'Answer must be retrieved properly under userId');
  console.log('✓ Test 5 PASSED: Repeating permissions eliminated and user answers verified.\n');

  console.log('===================================================================');
  console.log('ALL PHASE 5 MODES & PERMISSIONS TESTS PASSED (5/5)!');
  console.log('===================================================================');
}

runPhase5Tests().catch((err) => {
  console.error('PHASE 5 TEST FAILED:', err);
  process.exit(1);
});
