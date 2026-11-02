import assert from 'node:assert/strict';
import {
  isRiskyAction,
  runReviewerLevel,
  getReviewerAuditLog,
  clearReviewerAuditLog,
  hasNaturalUserApprovalIntent
} from '../src/core/levels/reviewer.js';
import { collectApprovedHosts } from '../src/core/tools/policy.js';
import { redactPiiAndInternalIds, stripRawBioJsonBlocks } from '../src/core/levels/plan-file.js';

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

  // PROOF 4: Final Submit Gate across Default, Review, Turbo, BIO rules, High-Risk & Go-Ahead
  console.log('\n[Proof 4] Testing Final Submit Gate across Default, Review, Turbo, BIO rules, and High-Risk with Go-Ahead...');
  const submitAction = { kind: 'submit', buttonLabel: 'Submit Application' };

  const defaultSubmit = await runReviewerLevel({
    userInstruction: 'Fill out and submit https://jobs.lever.co/acme/apply',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'default',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts
  });
  assert.equal(defaultSubmit.requiresUserConfirmation, true, 'Default mode requires user confirmation before final submit when no go-ahead given');

  const reviewSubmit = await runReviewerLevel({
    userInstruction: 'Fill out https://jobs.lever.co/acme/apply and go ahead',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'review',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts
  });
  assert.equal(reviewSubmit.requiresUserConfirmation, true, 'Request-a-Review mode always requires user confirmation before final submit');

  const fillOnlyTurboSubmit = await runReviewerLevel({
    userInstruction: 'Only fill out https://jobs.lever.co/acme/apply, do not submit',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts
  });
  assert.equal(fillOnlyTurboSubmit.decision, 'deny', 'Explicit do-not-submit instruction blocks final submit even in Turbo mode');

  const bioRuleNoSubmit = await runReviewerLevel({
    userInstruction: 'Fill out the application at https://jobs.lever.co/acme/apply',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts,
    bioRulesText: 'Always ask before submitting any job application.'
  });
  assert.equal(bioRuleNoSubmit.decision, 'deny', 'BIO rule forbidding automatic submit blocks final submit in Turbo mode');

  // Turbo mode with standard application ("Fill out the application...") and all required BIO fields ready -> autonomous submit (requiresUserConfirmation: false)!
  const autonomousTurboSubmit = await runReviewerLevel({
    userInstruction: 'Fill out the application at https://jobs.lever.co/acme/apply',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts,
    allRequiredFieldsReady: true,
    scannerWarnings: [{ fieldKey: 'inject_trap', reason: 'quarantined_by_level3' }]
  });
  assert.equal(autonomousTurboSubmit.decision, 'allow');
  assert.equal(
    autonomousTurboSubmit.requiresUserConfirmation,
    false,
    'Turbo mode submits autonomously when all required fields are ready from BIO'
  );

  // High-risk application in Turbo mode WITHOUT explicit "go ahead" -> pauses for confirmation
  const highRiskNoGoAhead = await runReviewerLevel({
    userInstruction: 'Fill out the binding loan application at https://jobs.lever.co/acme/apply',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: { kind: 'submit', buttonLabel: 'Submit Loan Application', isHighRiskApplication: true },
    currentOriginHost,
    approvedHosts,
    allRequiredFieldsReady: true
  });
  assert.equal(
    highRiskNoGoAhead.requiresUserConfirmation,
    true,
    'High-risk application pauses for confirmation when user did not explicitly say go ahead'
  );

  // High-risk application WITH explicit "go ahead" AND required BIO contexts/data ready -> goes ahead autonomously!
  const highRiskWithGoAhead = await runReviewerLevel({
    userInstruction: 'Fill out the binding loan application at https://jobs.lever.co/acme/apply and go ahead',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'turbo',
    proposedAction: { kind: 'submit', buttonLabel: 'Submit Loan Application', isHighRiskApplication: true },
    currentOriginHost,
    approvedHosts,
    allRequiredFieldsReady: true
  });
  assert.equal(highRiskWithGoAhead.decision, 'allow');
  assert.equal(
    highRiskWithGoAhead.requiresUserConfirmation,
    false,
    'High-risk application goes ahead autonomously when user explicitly mentioned go ahead and required BIO data are ready'
  );

  // PROOF 5: Natural Language & Multilingual Approval Phrasings (without literal "go ahead")
  console.log('\n[Proof 5] Testing Natural Language & Multilingual Approval Phrasings without literal "go ahead"...');
  const naturalPhrasings = [
    'Yes, do it',
    'Send it through',
    'Looks good, finalize it',
    'Knock yourself out',
    'Sure, submit it now',
    'Approved, make it happen',
    'Vas-y, envoie-le',
    'Schick es ab',
    'Adelante, envíalo'
  ];

  for (const phrase of naturalPhrasings) {
    assert.equal(
      hasNaturalUserApprovalIntent(phrase),
      true,
      `Phrase "${phrase}" must be recognized as natural approval intent`
    );

    const naturalSubmit = await runReviewerLevel({
      userInstruction: `Fill out the loan application at https://jobs.lever.co/acme/apply. ${phrase}`,
      activeProfileName: 'Alex Morgan (Default)',
      mode: 'turbo',
      proposedAction: { kind: 'submit', buttonLabel: 'Submit Loan Application', isHighRiskApplication: true },
      currentOriginHost,
      approvedHosts,
      allRequiredFieldsReady: true
    });
    assert.equal(
      naturalSubmit.requiresUserConfirmation,
      false,
      `High-risk application with natural phrase "${phrase}" must not pause for confirmation when required BIO data are ready`
    );
  }
  console.log(`  -> Verified ${naturalPhrasings.length} natural/multilingual approval phrasings pass without pause.`);

  // PROOF 6: UI / Thread Approval Signals (resume.approved / approvals cache)
  console.log('\n[Proof 6] Testing UI and Thread Approval signals...');
  const uiApprovedDefault = await runReviewerLevel({
    userInstruction: 'Fill out https://jobs.lever.co/acme/apply',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'default',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts,
    allRequiredFieldsReady: true,
    userApproved: true
  });
  assert.equal(uiApprovedDefault.decision, 'allow');
  assert.equal(
    uiApprovedDefault.requiresUserConfirmation,
    false,
    'Explicit UI userApproved: true clears requiresUserConfirmation in Default mode'
  );

  const threadApprovedReview = await runReviewerLevel({
    userInstruction: 'Fill out https://jobs.lever.co/acme/apply',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'review',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts,
    allRequiredFieldsReady: true,
    approvals: new Set(['browser_action'])
  });
  assert.equal(threadApprovedReview.decision, 'allow');
  assert.equal(
    threadApprovedReview.requiresUserConfirmation,
    false,
    'Thread approvals set containing browser_action clears requiresUserConfirmation'
  );
  console.log('  -> UI userApproved and thread approvals set successfully authorize submit.');

  // PROOF 7: Model Semantic Intent Decision via mockModelCall
  console.log('\n[Proof 7] Testing Model Semantic Intent Decision evaluation...');
  const mockModelApproved = await runReviewerLevel({
    userInstruction: 'Fill out https://jobs.lever.co/acme/apply. I fully endorse this application submission.',
    activeProfileName: 'Alex Morgan (Default)',
    mode: 'default',
    proposedAction: submitAction,
    currentOriginHost,
    approvedHosts,
    allRequiredFieldsReady: true,
    mockModelCall: async () => ({
      text: JSON.stringify({
        decision: 'allow',
        requiresUserConfirmation: false,
        reason: 'User explicitly endorsed the submission in natural prose.'
      })
    })
  });
  assert.equal(mockModelApproved.decision, 'allow');
  assert.equal(
    mockModelApproved.requiresUserConfirmation,
    false,
    'Model semantic evaluation returning requiresUserConfirmation: false is honored when hard constraints pass'
  );
  console.log('  -> Model semantic decision honored:', mockModelApproved.reason);

  // PROOF 8: Raw BIO JSON Echo Stripping and PII Redaction
  console.log('\n[Proof 8] Testing raw BIO JSON stripping and chat PII redaction...');
  const echoedBioJson = 'Sure! {"profileName": "Alex Morgan (Default)", "values": {"fullName": "Alex Morgan", "dob": "1994-06-15", "address": "742 Evergreen Terrace"}} I will fill the form with biofile-12345.';
  const stripped = stripRawBioJsonBlocks(echoedBioJson);
  assert.equal(stripped.includes('Alex Morgan (Default)'), false, 'Raw BIO JSON block must be stripped');
  assert.equal(stripped.includes('742 Evergreen'), false, 'Raw BIO values inside JSON must be stripped');

  const redacted = redactPiiAndInternalIds(echoedBioJson, {
    fields: { dob: '1994-06-15', address: '742 Evergreen Terrace' }
  });
  assert.equal(redacted.includes('biofile-12345'), false, 'biofile- IDs must be redacted');
  assert.equal(redacted.includes('1994-06-15'), false, 'DOB must be redacted');
  assert.equal(redacted.includes('742 Evergreen Terrace'), false, 'Street address must be redacted');
  console.log('  -> Raw BIO JSON payload cleanly stripped and internal IDs/PII redacted.');

  const auditLog = getReviewerAuditLog();
  assert.ok(auditLog.length >= 20, 'All reviewer decisions must be recorded in the audit log');
  // Confirm reviewer context never contains raw page text or raw DOB/address
  for (const entry of auditLog) {
    const serialized = JSON.stringify(entry.reviewContextSent);
    assert.equal(serialized.includes('1994-06-15'), false);
    assert.equal(serialized.includes('742 Evergreen'), false);
  }
  console.log(`  -> All ${auditLog.length} Reviewer decisions logged and verified clean of raw page text / PII.`);

  console.log('\nALL SUBPHASE 4 PROOFS PASSED!');
}

main().catch((err) => {
  console.error('SUBPHASE 4 TEST FAILED:', err);
  process.exit(1);
});
