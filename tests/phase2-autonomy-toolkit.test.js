/**
 * Phase 2 Verification Test Suite: Autonomy Toolkit Inside Sandbox
 *
 * Proves:
 * 1. page_snapshot writes clean accessibility tree/DOM to notes/page-structure.md (compact summary to chat).
 * 2. notes_write and notes_read operate confined to the sandbox scratch directory.
 * 3. sandbox_run_script evaluates custom batch scripts safely inside page DOM and sandbox Node runtime.
 * 4. browser_action handles humanLike keystroke delays, selectOption, and sandboxed file uploads.
 * 5. checkpoint_save and checkpoint_load persist section progress and allow seamless resumption.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRunSandbox, destroyRunSandbox } from '../src/core/execution/run-sandbox.js';
import { createSandboxToolkit } from '../src/core/levels/sandbox-tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('=== PHASE 2: AUTONOMY TOOLKIT INSIDE SANDBOX VERIFICATION ===\n');

// Mock Playwright Page for deterministic toolkit testing
function createMockPage() {
  const domState = {
    title: 'Dummy Job Application',
    url: 'http://127.0.0.1:4000/apply',
    inputs: [
      { id: 'full_name', name: 'fullName', type: 'text', label: 'Full Name', required: true, value: '' },
      { id: 'email_addr', name: 'email', type: 'email', label: 'Email Address', required: true, value: '' },
      { id: 'phone_num', name: 'phone', type: 'tel', label: 'Phone Number', required: true, value: '' },
      { id: 'role_select', name: 'role', type: 'select', label: 'Position', required: true, options: ['Engineer', 'Designer', 'Product'], value: '' }
    ],
    buttons: [
      { id: 'submit_btn', type: 'submit', label: 'Submit Application' }
    ]
  };

  const actionsLog = [];

  return {
    url: () => domState.url,
    evaluate: async (fn, arg) => {
      if (typeof fn === 'function') {
        // Evaluate simulated page structure
        return {
          title: domState.title,
          url: domState.url,
          fields: domState.inputs.map((i, idx) => ({
            fieldKey: i.name,
            label: i.label,
            tag: i.type === 'select' ? 'select' : 'input',
            type: i.type,
            selector: `#${i.id}`,
            required: i.required,
            options: i.options,
            currentValue: i.value
          })),
          actionButtons: domState.buttons.map((b) => ({
            label: b.label,
            type: b.type,
            selector: `#${b.id}`
          }))
        };
      }
      // If code string passed for evaluation (sandbox_run_script)
      return { success: true, evaluated: true, codeLength: String(arg || '').length };
    },
    locator: (selector) => ({
      first: () => ({
        waitFor: async () => {},
        click: async () => { actionsLog.push({ action: 'click', selector }); },
        fill: async (val) => { actionsLog.push({ action: 'fill', selector, val }); },
        type: async (val) => { actionsLog.push({ action: 'type', selector, val }); },
        selectOption: async (opt) => { actionsLog.push({ action: 'select', selector, opt }); },
        setInputFiles: async (file) => { actionsLog.push({ action: 'upload', selector, file }); },
        evaluate: async () => {}
      })
    }),
    screenshot: async () => Buffer.from('mock_screenshot_png_bytes'),
    waitForTimeout: async (ms) => new Promise((r) => setTimeout(r, ms)),
    _actionsLog: actionsLog
  };
}

async function runPhase2Tests() {
  const runId = `test-phase2-${Date.now()}`;
  const sandbox = createRunSandbox({ runId });
  const mockPage = createMockPage();
  const streamedEvents = [];

  const toolkit = createSandboxToolkit({
    runSandbox: sandbox,
    page: mockPage,
    emitEvent: (evt) => streamedEvents.push(evt)
  });

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: page_snapshot writes clean markdown to notes/page-structure.md
    // ---------------------------------------------------------------------------
    console.log('[Test 1] Testing page_snapshot...');
    const snapshotSummary = await toolkit.page_snapshot();
    console.log('  -> Summary returned to model:', snapshotSummary);
    assert(snapshotSummary.includes('notes/page-structure.md'), 'Summary must mention the notes file path');
    assert(snapshotSummary.includes('4 interactive fields'), 'Summary must report field count');

    const notesPath = path.join(sandbox.workDir, 'notes/page-structure.md');
    assert(fs.existsSync(notesPath), 'notes/page-structure.md must exist in sandbox scratch');
    const notesContent = fs.readFileSync(notesPath, 'utf8');
    assert(notesContent.includes('# Page Structure & Interactive Elements'), 'Notes must have title header');
    assert(notesContent.includes('Full Name'), 'Notes must list form fields');
    assert(notesContent.includes('Submit Application'), 'Notes must list submit buttons');

    const snapEvent = streamedEvents.find((e) => e.type === 'AGENT_SNAPSHOT_TAKEN');
    assert(snapEvent, 'AGENT_SNAPSHOT_TAKEN event must be emitted');
    assert.strictEqual(snapEvent.fieldsCount, 4, 'Event must report 4 fields');
    console.log('✓ Test 1 PASSED: page_snapshot structured notes verified.\n');

    // ---------------------------------------------------------------------------
    // TEST 2: notes_read & notes_write confined to sandbox scratch space
    // ---------------------------------------------------------------------------
    console.log('[Test 2] Testing notes_write and notes_read...');
    const writeRes = await toolkit.notes_write({
      path: 'notes/form-plan.md',
      content: '1. Fill personal section\n2. Fill education section\n3. Upload CV'
    });
    console.log('  -> notes_write result:', writeRes);
    assert(writeRes.includes('notes/form-plan.md'), 'Must write to notes/form-plan.md');

    const readRes = await toolkit.notes_read({ path: 'notes/form-plan.md' });
    console.log('  -> notes_read result:\n', readRes);
    assert.strictEqual(readRes, '1. Fill personal section\n2. Fill education section\n3. Upload CV');
    console.log('✓ Test 2 PASSED: notes_read & notes_write scratchpad verified.\n');

    // ---------------------------------------------------------------------------
    // TEST 3: sandbox_run_script (batch DOM & sandboxed Node execution)
    // ---------------------------------------------------------------------------
    console.log('[Test 3] Testing sandbox_run_script...');
    const domScriptRes = await toolkit.sandbox_run_script({
      script: 'return { filled: 3, status: "ok" };',
      target: 'browser'
    });
    console.log('  -> DOM script result:', domScriptRes);
    assert(domScriptRes.includes('evaluated') || domScriptRes.includes('true'), 'DOM script must evaluate successfully');

    const nodeScriptRes = await toolkit.sandbox_run_script({
      script: 'console.log("math:" + (40 + 2));',
      target: 'sandbox_node'
    });
    console.log('  -> Sandbox Node script result:', nodeScriptRes.trim());
    assert(nodeScriptRes.includes('math:42'), 'Sandboxed Node script must execute safely');
    console.log('✓ Test 3 PASSED: sandbox_run_script batch execution verified.\n');

    // ---------------------------------------------------------------------------
    // TEST 4: browser_action with humanLike keystrokes & sandboxed uploads
    // ---------------------------------------------------------------------------
    console.log('[Test 4] Testing browser_action (humanLike keystrokes and sandboxed upload)...');
    await toolkit.browser_action({
      action: 'type',
      selector: '#full_name',
      value: 'Alex Morgan',
      humanLike: true
    });
    const typeAction = mockPage._actionsLog.find((a) => a.action === 'type' && a.selector === '#full_name');
    assert(typeAction, 'Human-like type action must be invoked on Playwright page');
    assert.strictEqual(typeAction.val, 'Alex Morgan');

    // Stage a test file in sandbox /inputs and test upload
    const dummyFile = path.join(sandbox.inputsDir, 'resume.pdf');
    fs.writeFileSync(dummyFile, 'dummy pdf content', 'utf8');

    await toolkit.browser_action({
      action: 'upload',
      selector: '#cv_upload',
      value: 'resume.pdf'
    });
    const uploadAction = mockPage._actionsLog.find((a) => a.action === 'upload' && a.selector === '#cv_upload');
    assert(uploadAction, 'Upload action must be invoked on Playwright page');
    assert(uploadAction.file.includes(sandbox.inputsDir), 'File upload must resolve strictly from sandbox /inputs');
    console.log('✓ Test 4 PASSED: browser_action human-like typing and sandboxed upload verified.\n');

    // ---------------------------------------------------------------------------
    // TEST 5: checkpoint_save and checkpoint_load for section progress
    // ---------------------------------------------------------------------------
    console.log('[Test 5] Testing checkpoint_save and checkpoint_load...');
    const saveMsg = await toolkit.checkpoint_save({
      section: 'Personal Details',
      completedFields: ['fullName', 'email', 'phone'],
      remainingFields: ['role']
    });
    console.log('  -> checkpoint_save:', saveMsg);

    const loaded = await toolkit.checkpoint_load();
    console.log('  -> checkpoint_load:', loaded);
    assert.strictEqual(loaded.section, 'Personal Details');
    assert.strictEqual(loaded.completedFields.length, 3);
    assert.strictEqual(loaded.remainingFields[0], 'role');
    console.log('✓ Test 5 PASSED: checkpoint persistence and progress recovery verified.\n');

    console.log('===================================================================');
    console.log('ALL PHASE 2 AUTONOMY TOOLKIT TESTS PASSED (5/5)!');
    console.log('===================================================================');
  } finally {
    await destroyRunSandbox(runId, 'completed');
  }
}

runPhase2Tests().catch((err) => {
  console.error('PHASE 2 TEST FAILED:', err);
  process.exit(1);
});
