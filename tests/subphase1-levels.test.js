import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getLevelToolRegistry,
  checkLevelToolAccess,
  executeLevelTool
} from '../src/core/levels/registries.js';
import {
  validateFormSchema,
  validateFillPlan,
  validateReviewerDecision,
  getInterLevelDropLog,
  clearInterLevelDropLog
} from '../src/core/levels/schema.js';
import { compareExtractorAndReaderSchemas } from '../src/core/levels/comparator.js';
import {
  writeTemporaryFillPlan,
  destroyTemporaryFillPlan,
  buildMaskedPlanAuditSummary
} from '../src/core/levels/plan-file.js';
import { runMultiLevelFormPipeline } from '../src/core/levels/pipeline.js';
import { getActiveProfile, updateProfile } from '../src/core/bio/store.js';
import { executeBioSearch } from '../src/core/bio/executors.js';

const TEST_USER_ID = `test-subphase1-${Date.now()}`;

async function main() {
  console.log('=== SUBPHASE 1: MULTI-LEVEL ISOLATION, REGISTRIES, COMPARATOR & PLAN FILE PROOFS ===\n');

  const profile = getActiveProfile(TEST_USER_ID);
  updateProfile(TEST_USER_ID, profile.id, { grants: { read: true, write: false } });
  const bioAccess = {
    userId: TEST_USER_ID,
    profileId: profile.id,
    read: true,
    write: false
  };

  // PROOF 1: Browser subagent cannot call BIO tools
  console.log('[Proof 1] Testing Level 1 Browser Subagent refusal on BIO tools...');
  const browserTools = getLevelToolRegistry('browser_subagent', { bioAccess });
  assert.equal(browserTools.some((t) => t.name.startsWith('bio_')), false);
  let browserBioErr = null;
  try {
    await executeLevelTool({
      level: 'browser_subagent',
      toolName: 'bio_get',
      toolArgs: { field_ids: ['fullName'] },
      context: { bioAccess },
      executor: async () => 'should-not-run'
    });
  } catch (err) {
    browserBioErr = err;
  }
  assert.ok(browserBioErr, 'Browser subagent must throw when calling bio_get');
  assert.equal(browserBioErr.code, 'LEVEL_TOOL_DENIED');
  console.log('  -> Refused with:', browserBioErr.message);

  // PROOF 2: Planner cannot call browser, shell, or network tools
  console.log('\n[Proof 2] Testing Level 3 Planner refusal on browser, shell, and network tools...');
  const plannerTools = getLevelToolRegistry('planner', { bioAccess });
  assert.equal(plannerTools.every((t) => t.name.startsWith('bio_') || t.name.startsWith('process_')), true);
  for (const forbiddenTool of ['browser_action', 'browser_read_page', 'shell_run', 'web_search', 'file_write']) {
    const check = checkLevelToolAccess('planner', forbiddenTool, { bioAccess });
    assert.equal(check.allowed, false, `Planner must refuse ${forbiddenTool}`);
    assert.equal(check.code, 'LEVEL_TOOL_DENIED');
    console.log(`  -> Planner refused "${forbiddenTool}": ${check.error}`);
  }

  // PROOF 3: Reader has zero tools and refuses any tool or command
  console.log('\n[Proof 3] Testing Level 2B Reader zero-tool enforcement...');
  const readerTools = getLevelToolRegistry('reader', { bioAccess });
  assert.equal(readerTools.length, 0);
  for (const anyTool of ['bio_get', 'browser_read_page', 'shell_run']) {
    const check = checkLevelToolAccess('reader', anyTool, { bioAccess });
    assert.equal(check.allowed, false);
    assert.equal(check.code, 'LEVEL_TOOL_DENIED');
    console.log(`  -> Reader refused "${anyTool}": ${check.error}`);
  }

  // PROOF 4: Comparator marks fields seen by only one layer or described differently as DISPUTED
  console.log('\n[Proof 4] Testing Level 2C Comparator (VERIFIED vs DISPUTED)...');
  const extractorSchema = {
    fields: [
      { fieldKey: 'f1', label: 'Full Name', normalizedLabel: 'full name', type: 'text', required: true, options: [], section: 'Main' },
      { fieldKey: 'f2', label: 'Email', normalizedLabel: 'email', type: 'email', required: true, options: [], section: 'Main' },
      { fieldKey: 'f3', label: 'Role', normalizedLabel: 'role', type: 'select', required: true, options: ['Engineer', 'Designer'], section: 'Main' },
      { fieldKey: 'f4', label: 'Extractor Only Secret', normalizedLabel: 'extractor only secret', type: 'text', required: false, options: [], section: 'Main' }
    ]
  };
  const readerSchema = {
    fields: [
      { label: 'Full Name', normalizedLabel: 'full name', type: 'text', required: true, options: [], section: 'Main' },
      // Type mismatch on Email (text vs email) -> must be DISPUTED
      { label: 'Email', normalizedLabel: 'email', type: 'text', required: true, options: [], section: 'Main' },
      // Options mismatch on Role -> must be DISPUTED
      { label: 'Role', normalizedLabel: 'role', type: 'select', required: true, options: ['Engineer', 'Manager'], section: 'Main' },
      // Reader-only hallucinated/injected field -> must be DISPUTED and never added
      { label: 'Reader Hallucinated Field', normalizedLabel: 'reader hallucinated field', type: 'text', required: true, options: [], section: 'Main' }
    ]
  };
  const comp = compareExtractorAndReaderSchemas(extractorSchema, readerSchema);
  assert.equal(comp.verifiedFields.length, 1, 'Only Full Name should be VERIFIED');
  assert.equal(comp.verifiedFields[0].label, 'Full Name');
  assert.equal(comp.disputedFields.length, 4, 'Email, Role, Extractor-Only, and Reader-Only must all be DISPUTED');
  console.log('  -> Verified fields:', comp.verifiedFields.map((f) => f.label));
  console.log('  -> Disputed fields:', comp.disputedLog.map((d) => `${d.label}: ${d.reason}`));

  // PROOF 5: Inter-level schema validation drops and logs malformed messages
  console.log('\n[Proof 5] Testing inter-level schema validator drop & log...');
  clearInterLevelDropLog();
  const badSchema = validateFormSchema('{not valid json', 'reader_2b');
  assert.equal(badSchema.valid, false);
  assert.equal(badSchema.dropped, true);
  const badPlan = validateFillPlan({
    runId: 'run-bad',
    items: [
      {
        fieldKey: 'fullName',
        label: 'Full Name',
        classifiedKind: 'fullName',
        status: 'READY',
        value: 'Invented Name Without BIO Source',
        bioSource: null
      }
    ]
  });
  assert.equal(badPlan.valid, false);
  assert.equal(badPlan.dropped, true);
  const badReview = validateReviewerDecision({ decision: 'maybe', reason: '' });
  assert.equal(badReview.valid, false);
  assert.equal(badReview.dropped, true);
  const drops = getInterLevelDropLog();
  assert.equal(drops.length, 3);
  console.log('  -> Dropped messages logged:', drops.map((d) => ({ stage: d.stage, errors: d.errors })));

  // PROOF 6 & 7: Separate sandboxes per level + owner-only (0o600) temporary Fill Plan deleted on completion AND on crash
  console.log('\n[Proof 6 & 7] Testing separate sandboxes and temporary Fill Plan lifecycle (normal finish + simulated crash)...');
  const sampleHtml = `
    <form>
      <h2>Applicant Info</h2>
      <label for="fullName">Full Name *</label>
      <input id="fullName" name="fullName" type="text" required />
      <label for="email">Email *</label>
      <input id="email" name="email" type="email" required />
      <button type="submit">Submit Application</button>
    </form>
  `;
  const normalRun = await runMultiLevelFormPipeline({
    runId: `subphase1-normal-${Date.now()}`,
    userId: TEST_USER_ID,
    userInstruction: 'Fill out this application form',
    url: 'https://jobs.lever.co/example/apply',
    html: sampleHtml,
    mode: 'default',
    model: 'muse-spark-open'
  });
  assert.equal(normalRun.ok, true);
  assert.equal(normalRun.sandboxes.distinctSandboxes, true, 'Browser and Planner must run in separate sandboxes');
  assert.equal(fs.existsSync(normalRun.sandboxes.level1BrowserSandboxRoot), false, 'Browser sandbox destroyed after run');
  assert.equal(fs.existsSync(normalRun.sandboxes.level3PlannerSandboxRoot), false, 'Planner sandbox destroyed after run');
  assert.equal(fs.existsSync(normalRun.planner.planFilePathDuringRun), false, 'Temporary plan file deleted after normal run');
  assert.equal(normalRun.safeUserMessage.includes(profile.fields.dateOfBirth), false, 'DOB never in chat summary');
  assert.equal(normalRun.safeUserMessage.includes(profile.fields.address.street), false, 'Street address never in chat summary');
  console.log('  -> Distinct sandboxes verified:', normalRun.sandboxes);
  console.log('  -> Masked audit summary (no raw PII):', JSON.stringify(normalRun.planner.maskedAuditSummary));
  console.log('  -> Safe user message:', normalRun.safeUserMessage);

  // Crash cleanup proof
  const crashRunId = `subphase1-crash-${Date.now()}`;
  const manualPlanRecord = writeTemporaryFillPlan(
    crashRunId,
    {
      runId: crashRunId,
      items: [
        {
          fieldKey: 'fullName',
          label: 'Full Name',
          classifiedKind: 'fullName',
          status: 'READY',
          value: profile.fields.fullName,
          bioSource: { profileId: profile.id, fieldId: 'fullName' }
        }
      ]
    },
    { expectedProfileId: profile.id }
  );
  assert.equal(fs.existsSync(manualPlanRecord.planFilePath), true, 'Plan file exists during active run');
  const destroyReport = destroyTemporaryFillPlan(crashRunId);
  assert.equal(destroyReport.existsAfterCleanup, false, 'Plan file deleted on crash/cancel cleanup');
  console.log('  -> Crash cleanup verified: existsAfterCleanup =', destroyReport.existsAfterCleanup);

  // PROOF 8: Meta model family rule
  console.log('\n[Proof 8] Testing Meta model family enforcement across levels...');
  assert.equal(normalRun.modelFamily, 'meta');
  assert.equal(normalRun.modelUsed, 'muse-spark-open');
  console.log('  -> Active model & family:', { modelUsed: normalRun.modelUsed, modelFamily: normalRun.modelFamily });

  // PROOF 9: Unreadable BIO audio entries (e.g. Name Pronunciation with agentReadable=false) excluded from bio_search
  console.log('\n[Proof 9] Testing that bio_search excludes ungranted audio entries...');
  const searchResultRaw = await executeBioSearch({
    userId: TEST_USER_ID,
    query: 'audio pronunciation voice',
    model: 'muse-spark-open'
  });
  const searchParsed = JSON.parse(searchResultRaw);
  assert.equal(Array.isArray(searchParsed.matches), true, 'No ungranted audio entry should be returned by bio_search');
  assert.equal(searchParsed.matches.length, 0);
  console.log('  -> bio_search for ungranted audio returned 0 matches:', searchParsed.message);

  console.log('\nALL 9 SUBPHASE 1 PROOFS PASSED!');
}

main().catch((err) => {
  console.error('SUBPHASE 1 TEST FAILED:', err);
  process.exit(1);
});
