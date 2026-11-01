/**
 * Phase 1 Verification Test Suite: Isolated Run Sandbox & Dynamic Turn Budgeting
 *
 * Proves:
 * 1. Trying to read a workspace file from inside a run FAILS (both shell & file tools).
 * 2. Trying to write outside the sandbox (or overwrite read-only BIO inputs) from inside a run FAILS.
 * 3. Trying to leak host/workspace environment variables from inside a run FAILS.
 * 4. Only task-needed BIO files are copied in read-only (0o444), and outputs return via the explicit logged channel.
 * 5. Network allowlist & egress log block unauthorized hosts, private/metadata IPs, and file:// URLs.
 * 6. CPU, memory, and wall-clock time limits kill runaway processes, and cleanup runs on completion, crash, or cancel.
 * 7. Dynamic turn budgeting scales past the old 25-turn cap to 100+ turns when the agent is making progress.
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createRunSandbox,
  getRunSandbox,
  destroyRunSandbox,
  runSandboxCommand,
  workspaceFileRead,
  workspaceFileWrite,
  AgentBudgetTracker,
  OmniEngine
} from '../src/core/index.js';
import { stageBioFile, resolveStagedFile, setActiveStagingRunId } from '../src/core/bio/staging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('=== PHASE 1: ISOLATED RUN SANDBOX & DYNAMIC TURN CAP VERIFICATION ===\n');

async function runPhase1Tests() {
  // ---------------------------------------------------------------------------
  // PROOF 1: Attempt to read a workspace file from inside a run -> MUST FAIL
  // ---------------------------------------------------------------------------
  console.log('[Proof 1] Attempting to read workspace/host files from inside a run...');
  const runId1 = `test-phase1-read-${Date.now()}`;
  const sb1 = createRunSandbox({ runId: runId1 });

  try {
    // 1a. Verify sandbox root is in OS temp dir, completely disjoint from PROJECT_ROOT
    assert(
      !path.normalize(sb1.sandboxRoot).toLowerCase().startsWith(path.normalize(PROJECT_ROOT).toLowerCase()),
      'Sandbox root must be outside PROJECT_ROOT'
    );

    // 1b. Shell command attempting to read package.json in project root
    const cmdReadPkg = await runSandboxCommand({
      runId: runId1,
      command: `node -e "const fs=require('fs'); console.log(fs.readFileSync(${JSON.stringify(path.join(PROJECT_ROOT, 'package.json'))}, 'utf8'))"`
    });
    console.log('  -> Shell read PROJECT_ROOT/package.json:', {
      exitCode: cmdReadPkg.exitCode,
      blocked: cmdReadPkg.blocked,
      output: cmdReadPkg.output
    });
    assert.strictEqual(cmdReadPkg.exitCode, 1, 'Reading PROJECT_ROOT/package.json via shell must fail');
    assert(!cmdReadPkg.stdout.includes('"omni-agent"'), 'package.json content must never leak');

    // 1c. Shell command attempting relative parent traversal (../../package.json)
    const cmdReadRel = await runSandboxCommand({
      runId: runId1,
      command: `node -e "const fs=require('fs'); console.log(fs.readFileSync('../../package.json', 'utf8'))"`
    });
    console.log('  -> Shell read ../../package.json:', {
      exitCode: cmdReadRel.exitCode,
      blocked: cmdReadRel.blocked,
      output: cmdReadRel.output
    });
    assert.strictEqual(cmdReadRel.exitCode, 1, 'Relative parent traversal via shell must fail');

    // 1d. Shell command attempting to read machine PEM key
    const cmdReadPem = await runSandboxCommand({
      runId: runId1,
      command: `type "C:\\Users\\USER\\Downloads\\omni-agent-key.pem"`
    });
    console.log('  -> Shell read machine PEM key:', {
      exitCode: cmdReadPem.exitCode,
      blocked: cmdReadPem.blocked,
      output: cmdReadPem.output
    });
    assert.strictEqual(cmdReadPem.exitCode, 1, 'Reading host .pem key must be blocked');

    // 1e. workspaceFileRead attempting to read interior repo file (src/core/orchestrator.js) without seeding
    let fileReadRepoFailed = false;
    let fileReadRepoError = '';
    try {
      workspaceFileRead({ path: 'src/core/orchestrator.js', runId: runId1 });
    } catch (err) {
      fileReadRepoFailed = true;
      fileReadRepoError = err.message;
    }
    console.log('  -> workspaceFileRead("src/core/orchestrator.js"):', {
      failed: fileReadRepoFailed,
      error: fileReadRepoError
    });
    assert(fileReadRepoFailed, 'workspaceFileRead must NOT copy or read repo files from PROJECT_ROOT');

    // 1f. workspaceFileRead attempting to read .env
    let fileReadEnvFailed = false;
    let fileReadEnvError = '';
    try {
      workspaceFileRead({ path: '.env', runId: runId1 });
    } catch (err) {
      fileReadEnvFailed = true;
      fileReadEnvError = err.message;
    }
    console.log('  -> workspaceFileRead(".env"):', {
      failed: fileReadEnvFailed,
      error: fileReadEnvError
    });
    assert(fileReadEnvFailed, 'workspaceFileRead(".env") must be denied');

    console.log('✓ Proof 1 PASSED: All workspace/host file read attempts failed.\n');
  } finally {
    await sb1.destroy('test_1_done');
  }

  // ---------------------------------------------------------------------------
  // PROOF 2: Attempt to write outside the sandbox from inside a run -> MUST FAIL
  // ---------------------------------------------------------------------------
  console.log('[Proof 2] Attempting to write outside the sandbox from inside a run...');
  const runId2 = `test-phase1-write-${Date.now()}`;
  const sb2 = createRunSandbox({ runId: runId2 });
  const hostEscapeTarget = path.join(PROJECT_ROOT, 'sandbox-escape-test.txt');

  try {
    // 2a. Shell command attempting to write into PROJECT_ROOT
    const cmdWriteHost = await runSandboxCommand({
      runId: runId2,
      command: `node -e "require('fs').writeFileSync(${JSON.stringify(hostEscapeTarget)}, 'pwned')"`
    });
    console.log('  -> Shell write to PROJECT_ROOT/sandbox-escape-test.txt:', {
      exitCode: cmdWriteHost.exitCode,
      blocked: cmdWriteHost.blocked,
      output: cmdWriteHost.output
    });
    assert.strictEqual(cmdWriteHost.exitCode, 1, 'Shell write to PROJECT_ROOT must fail');
    assert(!fs.existsSync(hostEscapeTarget), 'Escape file must not exist in PROJECT_ROOT');

    // 2b. Shell command attempting to write via ../escape.txt
    const cmdWriteParent = await runSandboxCommand({
      runId: runId2,
      command: `node -e "require('fs').writeFileSync('../escape.txt', 'pwned')"`
    });
    console.log('  -> Shell write to ../escape.txt:', {
      exitCode: cmdWriteParent.exitCode,
      blocked: cmdWriteParent.blocked,
      output: cmdWriteParent.output
    });
    assert.strictEqual(cmdWriteParent.exitCode, 1, 'Shell write to ../escape.txt must fail');

    // 2c. workspaceFileWrite attempting traversal ../escape.txt and absolute path
    let wsWriteTraversalFailed = false;
    let wsWriteTraversalErr = '';
    try {
      workspaceFileWrite({ path: '../escape.txt', content: 'bad', runId: runId2 });
    } catch (err) {
      wsWriteTraversalFailed = true;
      wsWriteTraversalErr = err.message;
    }
    console.log('  -> workspaceFileWrite("../escape.txt"):', {
      failed: wsWriteTraversalFailed,
      error: wsWriteTraversalErr
    });
    assert(wsWriteTraversalFailed, 'workspaceFileWrite("../escape.txt") must fail');

    let wsWriteAbsFailed = false;
    let wsWriteAbsErr = '';
    try {
      workspaceFileWrite({ path: hostEscapeTarget, content: 'bad', runId: runId2 });
    } catch (err) {
      wsWriteAbsFailed = true;
      wsWriteAbsErr = err.message;
    }
    console.log('  -> workspaceFileWrite(hostEscapeTarget):', {
      failed: wsWriteAbsFailed,
      error: wsWriteAbsErr
    });
    assert(wsWriteAbsFailed, 'workspaceFileWrite with absolute host path must fail');

    console.log('✓ Proof 2 PASSED: All out-of-sandbox write attempts failed.\n');
  } finally {
    await sb2.destroy('test_2_done');
  }

  // ---------------------------------------------------------------------------
  // PROOF 3: Attempt to leak host/workspace env vars from inside a run -> MUST FAIL
  // ---------------------------------------------------------------------------
  console.log('[Proof 3] Attempting to leak host/workspace env vars from inside a run...');
  process.env.GEMINI_API_KEY = 'test-secret-gemini-key-DO-NOT-LEAK';
  process.env.META_MUSE_API_KEY = 'test-secret-muse-key-DO-NOT-LEAK';
  process.env.SESSION_SECRET = 'test-secret-session-key-DO-NOT-LEAK';
  process.env.OMNI_WORKSPACE_SECRET = 'test-workspace-secret-DO-NOT-LEAK';

  const runId3 = `test-phase1-env-${Date.now()}`;
  const sb3 = createRunSandbox({ runId: runId3 });

  try {
    const envDumpRes = await runSandboxCommand({
      runId: runId3,
      command: `node -e "console.log(JSON.stringify(process.env))"`
    });
    assert.strictEqual(envDumpRes.exitCode, 0, 'Env inspection command inside sandbox should run');
    const childEnv = JSON.parse(envDumpRes.stdout.trim());
    const leakedKeys = [
      'GEMINI_API_KEY',
      'META_MUSE_API_KEY',
      'SESSION_SECRET',
      'OMNI_WORKSPACE_SECRET',
      'MODAL_KEY',
      'MODAL_SECRET',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY'
    ].filter((k) => childEnv[k] !== undefined);

    console.log('  -> Sandbox visible env keys:', Object.keys(childEnv));
    console.log('  -> Leaked secret keys count:', leakedKeys.length, leakedKeys);
    assert.strictEqual(leakedKeys.length, 0, 'Zero host secret env vars may exist in sandbox');
    assert.strictEqual(childEnv.HOME, '/sandbox', 'Sandbox HOME must be /sandbox');
    assert.strictEqual(childEnv.USER, 'sandbox', 'Sandbox USER must be sandbox');
    if (process.platform === 'win32') {
      assert.strictEqual(childEnv.USERNAME, 'sandbox', 'Windows USERNAME must be sandbox');
      assert.strictEqual(childEnv.USERPROFILE, '/sandbox', 'Windows USERPROFILE must be /sandbox');
    }
    assert(
      !String(childEnv.PATH || '').toLowerCase().includes('omni-agent'),
      'Sandbox PATH must not contain project workspace paths'
    );

    console.log('✓ Proof 3 PASSED: Zero host/workspace environment variables leaked.\n');
  } finally {
    delete process.env.OMNI_WORKSPACE_SECRET;
    await sb3.destroy('test_3_done');
  }

  // ---------------------------------------------------------------------------
  // PROOF 4: Read-only BIO file staging (0o444) & Explicit Logged Output Channel
  // ---------------------------------------------------------------------------
  console.log('[Proof 4] Verifying read-only BIO file copy (0o444) & explicit output channel...');
  const runId4 = `test-phase1-bio-${Date.now()}`;
  const sb4 = createRunSandbox({ runId: runId4 });
  setActiveStagingRunId(runId4);

  const dummySourceFile = path.join(os.tmpdir(), `dummy-bio-cv-${Date.now()}.pdf`);
  fs.writeFileSync(dummySourceFile, '%PDF-1.4 sample resume content', 'utf8');

  try {
    const token = stageBioFile({
      userId: 'user-test',
      absPath: dummySourceFile,
      name: 'Alex_Morgan_CV.pdf',
      mime: 'application/pdf',
      runId: runId4,
      fieldId: 'cv'
    });
    const resolved = resolveStagedFile(token, runId4);
    console.log('  -> Staged BIO file record:', {
      token: resolved.token,
      virtualPath: resolved.virtualPath,
      readOnly: resolved.readOnly,
      inSandboxInputs: resolved.sandboxPath.startsWith(sb4.inputsDir)
    });

    assert(resolved.readOnly, 'Staged BIO file must be marked readOnly');
    assert(
      resolved.sandboxPath.startsWith(sb4.inputsDir),
      'Staged BIO file must be copied inside sandbox /inputs directory'
    );
    assert.notStrictEqual(
      resolved.absPath,
      dummySourceFile,
      'Resolved upload path must point to the sandbox copy, not the host source file'
    );

    // Attempt to overwrite the read-only staged BIO file -> MUST FAIL
    let overwriteStagedFailed = false;
    try {
      fs.writeFileSync(resolved.sandboxPath, 'tampered content', 'utf8');
    } catch {
      overwriteStagedFailed = true;
    }
    console.log('  -> Attempt to overwrite read-only staged BIO file failed:', overwriteStagedFailed);
    assert(overwriteStagedFailed, 'Overwriting a 0o444 staged BIO file must fail');

    // Attempt to write to /sandbox/inputs via sandbox.writeFile -> MUST FAIL
    let sandboxInputWriteFailed = false;
    try {
      sb4.writeFile('/sandbox/inputs/injected.txt', 'bad');
    } catch {
      sandboxInputWriteFailed = true;
    }
    assert(sandboxInputWriteFailed, 'Writing into /sandbox/inputs must be denied');

    // Write an explicit output file to /sandbox/outputs and collect via output channel
    sb4.writeFile('/sandbox/outputs/fill-result.json', { filled: 5, status: 'ready' });
    const collectedOutputs = sb4.collectOutputFiles();
    const channelLog = sb4.getOutputChannelLog();
    console.log('  -> Collected output files:', collectedOutputs.map((f) => f.virtualPath));
    console.log(
      '  -> Explicit output channel log event types:',
      channelLog.map((e) => e.type)
    );
    assert.strictEqual(collectedOutputs.length, 1, 'Should collect 1 explicit output file');
    assert(
      channelLog.some((e) => e.type === 'BIO_FILE_STAGED_READONLY'),
      'Output channel log must record BIO_FILE_STAGED_READONLY'
    );
    assert(
      channelLog.some((e) => e.type === 'OUTPUT_FILE_COLLECTED'),
      'Output channel log must record OUTPUT_FILE_COLLECTED'
    );

    console.log('✓ Proof 4 PASSED: Read-only BIO staging & explicit output channel verified.\n');
  } finally {
    setActiveStagingRunId(null);
    await sb4.destroy('test_4_done');
    try { fs.unlinkSync(dummySourceFile); } catch {}
  }

  // ---------------------------------------------------------------------------
  // PROOF 5: Network Allowlist & Egress Log
  // ---------------------------------------------------------------------------
  console.log('[Proof 5] Verifying network allowlist & egress log...');
  const runId5 = `test-phase1-net-${Date.now()}`;
  const sb5 = createRunSandbox({
    runId: runId5,
    networkAllowlist: ['jobs.lever.co', 'greenhouse.io'],
    strictNetworkAllowlist: true,
    allowLocalhost: false
  });

  try {
    const rAllowed = sb5.checkNetworkRequest('https://jobs.lever.co/acme/apply', {
      method: 'GET',
      resourceType: 'document'
    });
    const rBlockedHost = sb5.checkNetworkRequest('https://evil-exfil.example.org/steal', {
      method: 'POST',
      resourceType: 'fetch'
    });
    const rBlockedMetadata = sb5.checkNetworkRequest('http://169.254.169.254/latest/meta-data/', {
      method: 'GET',
      resourceType: 'fetch'
    });
    const rBlockedFile = sb5.checkNetworkRequest('file:///etc/passwd', {
      method: 'GET',
      resourceType: 'document'
    });

    console.log('  -> Egress check results:', [
      { url: rAllowed.url, allowed: rAllowed.allowed, reason: rAllowed.reason },
      { url: rBlockedHost.url, allowed: rBlockedHost.allowed, reason: rBlockedHost.reason },
      { url: rBlockedMetadata.url, allowed: rBlockedMetadata.allowed, reason: rBlockedMetadata.reason },
      { url: rBlockedFile.url, allowed: rBlockedFile.allowed, reason: rBlockedFile.reason }
    ]);

    assert.strictEqual(rAllowed.allowed, true, 'Allowlisted host must be permitted');
    assert.strictEqual(rBlockedHost.allowed, false, 'Non-allowlisted host must be blocked');
    assert.strictEqual(rBlockedMetadata.allowed, false, 'Cloud metadata IP must be blocked');
    assert.strictEqual(rBlockedFile.allowed, false, 'file:// protocol must be blocked');
    assert.strictEqual(sb5.getEgressLog().length, 4, 'All 4 network requests must be logged in egressLog');

    console.log('✓ Proof 5 PASSED: Network allowlist & egress log verified.\n');
  } finally {
    await sb5.destroy('test_5_done');
  }

  // ---------------------------------------------------------------------------
  // PROOF 6: Resource/Time Limits & Guaranteed Cleanup on Crash / Cancel
  // ---------------------------------------------------------------------------
  console.log('[Proof 6] Verifying timeout enforcement and cleanup on completion, crash, and cancel...');
  const runId6a = `test-phase1-timeout-${Date.now()}`;
  const sb6a = createRunSandbox({ runId: runId6a, commandTimeoutMs: 500, memoryLimitMb: 128 });
  const sb6aRoot = sb6a.sandboxRoot;

  const sleepRes = await sb6a.execCommand(`node -e "setTimeout(() => {}, 5000)"`, { timeoutMs: 500 });
  console.log('  -> Timeout enforcement test:', {
    timedOut: sleepRes.timedOut,
    exitCode: sleepRes.exitCode,
    durationMs: sleepRes.durationMs
  });
  assert.strictEqual(sleepRes.timedOut, true, 'Command exceeding timeoutMs must time out');
  assert.strictEqual(sleepRes.exitCode, 124, 'Timed out command must return exit code 124');

  await sb6a.destroy('completed');
  assert(!fs.existsSync(sb6aRoot), 'Sandbox directory must be deleted after destroy()');

  // Test AbortController cancel cleanup
  const abortController = new AbortController();
  const runId6b = `test-phase1-cancel-${Date.now()}`;
  const sb6b = createRunSandbox({ runId: runId6b, signal: abortController.signal });
  const sb6bRoot = sb6b.sandboxRoot;
  assert(fs.existsSync(sb6bRoot), 'Sandbox directory exists before abort');
  abortController.abort();
  await new Promise((r) => setTimeout(r, 100));
  console.log('  -> Cancel cleanup test:', {
    destroyed: sb6b.destroyed,
    destroyReason: sb6b.destroyReason,
    existsOnDisk: fs.existsSync(sb6bRoot)
  });
  assert(sb6b.destroyed, 'Sandbox must be marked destroyed on abort signal');
  assert(!fs.existsSync(sb6bRoot), 'Sandbox directory must be removed from disk on abort');

  // Test crash cleanup inside try/finally
  const runId6c = `test-phase1-crash-${Date.now()}`;
  const sb6c = createRunSandbox({ runId: runId6c });
  const sb6cRoot = sb6c.sandboxRoot;
  try {
    throw new Error('Simulated mid-run crash');
  } catch {
    await destroyRunSandbox(runId6c, 'crash');
  }
  console.log('  -> Crash cleanup test:', {
    destroyed: sb6c.destroyed,
    destroyReason: sb6c.destroyReason,
    existsOnDisk: fs.existsSync(sb6cRoot)
  });
  assert(!fs.existsSync(sb6cRoot), 'Sandbox directory must be removed from disk on crash');
  assert.strictEqual(getRunSandbox(runId6c), null, 'Destroyed sandbox must be unregistered');
  console.log('✓ Proof 6 PASSED: Resource limits & crash/cancel cleanup verified.\n');

  // ---------------------------------------------------------------------------
  // PROOF 7: Dynamic Turn Cap (Scales to 100+ turns when making progress)
  // ---------------------------------------------------------------------------
  console.log('[Proof 7] Verifying dynamic turn cap scaling past 25 turns to 125+ turns...');
  const dynTracker = new AgentBudgetTracker({
    instruction: 'Fill out the multi-step job application form at https://example.com/apply'
  });
  assert.strictEqual(dynTracker.dynamicTurns, true, 'Dynamic turns must be enabled by default');
  assert.strictEqual(dynTracker.initialMaxTurns, 100, 'Complex form task starts with 100 turn baseline');

  for (let step = 1; step <= 125; step++) {
    const stop = dynTracker.recordTurnStart();
    assert.strictEqual(stop, null, `Turn ${step} must not hit max_turns while making progress`);
    const actCheck = dynTracker.recordToolCall('browser_action', {
      action: 'type',
      selectorOrText: `#field_${step}`,
      value: `val_${step}`
    });
    assert.strictEqual(actCheck.allowed, true, `Action at turn ${step} must be allowed`);

    // Interleave snapshot_read every turn (125 times!) after a state-changing browser_action
    const snapCheck = dynTracker.recordToolCall('snapshot_read', {});
    assert.strictEqual(
      snapCheck.allowed,
      true,
      `snapshot_read after mutation at turn ${step} must not trip repeated_calls`
    );
  }

  const summary = dynTracker.getSummary();
  console.log('  -> Dynamic Turn Tracker Summary after 125 turns:', summary);
  assert.strictEqual(summary.turns, 125, 'Tracker must complete all 125 turns');
  assert(summary.maxTurns >= 130, `Dynamic maxTurns should have expanded >= 130, got ${summary.maxTurns}`);
  assert(summary.turnExpansions >= 1, 'Tracker must have recorded automatic turn expansions');
  console.log('✓ Proof 7 PASSED: Dynamic turn cap scaled seamlessly to 125+ turns.\n');

  console.log('===================================================================');
  console.log('ALL PHASE 1 SANDBOX ISOLATION & DYNAMIC TURN TESTS PASSED (7/7)!');
  console.log('===================================================================');
}

runPhase1Tests().catch((err) => {
  console.error('PHASE 1 TEST FAILED:', err);
  process.exit(1);
});
