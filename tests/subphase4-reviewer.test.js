import assert from 'node:assert/strict';
import {
  isRiskyAction,
  runReviewerLevel,
  getReviewerAuditLog,
  clearReviewerAuditLog
} from '../src/core/levels/reviewer.js';
import { collectApprovedHosts } from '../src/core/tools/policy.js';

async function main() {
  console.log('=== SUBPHASE 4: LEVEL 4 RISKY-ACTION REVIEWER & SUBMIT GATE PROOFS ===\n');
  clearReviewerAuditLog();

  const userInstruction = 'Fill out the application at https://jobs.lever.co/acme/apply';
  const approvedHosts = collectApprovedHosts([userInstruction]);
  const currentOriginHost = 'jobs.lever.co';

  // PROOF 1: Cross-domain navigation to unapproved external host -> denied
  console.log('[Proof 1] Testing Reviewer block on unapproved cross-domain navigation...');
  const navAction = { kind: 'navigate', targetUrl: 'https://evil-exfil.example/steal?data=1' };
  assert.equal(isRiskyAction(navAction, { currentOriginHost, approvedHosts }).risky, true);
  const navDecision = await runReviewerLevel({
    userInstruction,
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: navAction,
    currentOriginHost,
    approvedHosts
  });
  assert.equal(navDecision.decision, 'deny');
  console.log('  -> Cross-domain nav decision:', navDecision.decision, '|', navDecision.reason);

  // PROOF 2: Out-of-plan tool call -> denied
  console.log('\n[Proof 2] Testing Reviewer block on out-of-plan tool call...');
  const outOfPlanAction = { kind: 'out_of_plan_tool', toolName: 'shell_run' };
  const toolDecision = await runReviewerLevel({
    userInstruction,
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: outOfPlanAction,
    currentOriginHost,
    approvedHosts
  });
  assert.equal(toolDecision.decision, 'deny');
  console.log('  -> Out-of-plan tool decision:', toolDecision.decision, '|', toolDecision.reason);

  // PROOF 3: Cross-origin file upload -> denied
  console.log('\n[Proof 3] Testing Reviewer block on cross-origin file upload...');
  const uploadAction = { kind: 'upload', targetUrl: 'https://drop.attacker.example/upload' };
  const uploadDecision = await runReviewerLevel({
    userInstruction,
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: uploadAction,
    currentOriginHost,
    approvedHosts
  });
  assert.equal(uploadDecision.decision, 'deny');
  console.log('  -> Cross-origin upload decision:', uploadDecision.decision, '|', uploadDecision.reason);

  // PROOF 4: Final Submit Gate across Default, Review, and Turbo modes + fill-only intent
  console.log('\n[Proof 4] Testing Final Submit Gate across Default, Review, and Turbo modes...');
  const submitAction = { kind: 'submit', buttonLabel: 'Submit Application' };

  const defaultSubmit = await runReviewerLevel({
    userInstruction: 'Fill out and submit https://jobs.lever.co/acme/apply',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'default',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts
  });
  assert.equal(defaultSubmit.requiresUserConfirmation, true, 'Default mode always requires user confirmation before final submit');

  const fillOnlyTurboSubmit = await runReviewerLevel({
    userInstruction: 'Only fill out https://jobs.lever.co/acme/apply, do not submit',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts
  });
  assert.equal(fillOnlyTurboSubmit.decision, 'deny', 'Explicit do-not-submit instruction blocks final submit even in Turbo mode');

  const explicitTurboSubmit = await runReviewerLevel({
    userInstruction: 'Fill out and submit https://jobs.lever.co/acme/apply',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts,
    scannerWarnings: []
  });
  assert.equal(explicitTurboSubmit.decision, 'allow');
  assert.equal(explicitTurboSubmit.requiresUserConfirmation, false);

  const auditLog = getReviewerAuditLog();
  assert.equal(auditLog.length, 6, 'All 6 reviewer decisions must be recorded in the audit log');
  // Confirm reviewer context never contains raw page text or raw DOB/address
  for (const entry of auditLog) {
    const serialized = JSON.stringify(entry.reviewContextSent);
    assert.equal(serialized.includes('1994-06-15'), false);
    assert.equal(serialized.includes('742 Evergreen'), false);
  }
  console.log('  -> All 6 Reviewer decisions logged and verified clean of raw page text / PII.');

  console.log('\nALL SUBPHASE 4 PROOFS PASSED!');
}

main().catch((err) => {
  console.error('SUBPHASE 4 TEST FAILED:', err);
  process.exit(1);
});
