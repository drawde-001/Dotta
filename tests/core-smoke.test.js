/**
 * Dotta Core Headless Smoke Test Suite
 * Verifies core engine exports, tool policies, budgeting, and workspace operations.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  DottaEngine,
  AGENT_TOOLS_CATALOG,
  getScopedTools,
  checkPermission,
  validateToolSchema,
  AgentBudgetTracker,
  calculateTurnCost,
  fingerprintToolCall,
  workspaceFileWrite,
  workspaceFileRead,
  workspaceFileList,
  workspaceFileSearch,
  workspaceFileEdit,
  workspaceFileDelete,
  resolveProviderForModel,
  getModelAdapter
} from '../src/index.js';

console.log('--- Starting Dotta Core Smoke Tests ---\n');

// 1. Tool Catalog & Scoping
console.log('[Test 1] Verifying Tool Catalog & Scoping...');
assert(AGENT_TOOLS_CATALOG.file_read, 'file_read should exist in catalog');
assert(AGENT_TOOLS_CATALOG.shell_run, 'shell_run should exist in catalog');
assert(AGENT_TOOLS_CATALOG.web_search, 'web_search should exist in catalog');
assert(AGENT_TOOLS_CATALOG.browser_search, 'browser_search should exist in catalog');

const scoped = getScopedTools({ phase: 'all' });
assert(scoped.length >= 10 && scoped.length <= 20, `Scoped tools count must be between 10 and 20, got ${scoped.length}`);
console.log('✓ Tool Catalog and Scoping verified.\n');

// 2. Tool Schema Validation
console.log('[Test 2] Verifying Tool Schema Validation...');
const readDef = AGENT_TOOLS_CATALOG.file_read;
const invalidCheck = validateToolSchema(readDef.parameters, {});
assert(!invalidCheck.valid, 'Schema validation should fail when required parameter is missing');
const validCheck = validateToolSchema(readDef.parameters, { path: 'test.txt', stepTitle: 'Read test file' });
assert(validCheck.valid, 'Schema validation should succeed when required parameters are provided');
console.log('✓ Tool Schema Validation verified.\n');

// 3. Security Policy (Deny, Ask, Allow)
console.log('[Test 3] Verifying Security Policy...');
// Traversal should deny
const traversalRes = checkPermission('file_read', { path: '../../passwords.txt', stepTitle: 'Read' });
assert.strictEqual(traversalRes.decision, 'deny', 'Path traversal must be denied');

// Sensitive credential should deny
const envRes = checkPermission('file_read', { path: '.env', stepTitle: 'Read' });
assert.strictEqual(envRes.decision, 'deny', 'Access to .env must be denied');

// file_delete requires confirmation (ask)
const deleteRes = checkPermission('file_delete', { path: 'temp.txt', stepTitle: 'Delete' });
assert.strictEqual(deleteRes.decision, 'ask', 'file_delete must ask for human confirmation');

// Safe read in turbo mode is allowed
const allowRes = checkPermission('file_read', { path: 'src/index.js', stepTitle: 'Read' });
assert.strictEqual(allowRes.decision, 'allow', 'Safe read must be allowed');
console.log('✓ Security Policy verified.\n');

// 4. Budget & Cycle Tracker
console.log('[Test 4] Verifying Budget & Cycle Tracker...');
const tracker = new AgentBudgetTracker({ maxTurns: 5, maxBudgetUsd: 1.0 });

// Record turn
assert.strictEqual(tracker.recordTurnStart(), null);

// Consecutive cycle detection (streak of 3 identical calls)
tracker.recordToolCall('file_read', { path: 'same.txt' });
tracker.recordToolCall('file_read', { path: 'same.txt' });
const cycleCheck = tracker.recordToolCall('file_read', { path: 'same.txt' });
assert(!cycleCheck.allowed, 'Consecutive cycle detector should flag repeated identical calls');
assert.strictEqual(tracker.stopReason, 'repeated_calls');
console.log('✓ Budget & Cycle Tracker verified.\n');

// 5. Workspace File Operations
console.log('[Test 5] Verifying Workspace File Operations...');
const testDir = path.resolve(process.cwd(), 'temp_test_workspace_' + Date.now());
fs.mkdirSync(testDir, { recursive: true });

try {
  // Write
  workspaceFileWrite({ path: 'test.txt', content: 'Hello World\nLine 2', workspaceRoot: testDir });
  assert(fs.existsSync(path.join(testDir, 'test.txt')), 'File should be written');

  // Read
  const content = workspaceFileRead({ path: 'test.txt', workspaceRoot: testDir });
  assert(content.includes('Hello World'), 'File content should match');

  // Search
  const searchRes = workspaceFileSearch({ pattern: 'World', workspaceRoot: testDir });
  assert(searchRes.includes('CONTENT MATCH'), 'Search should locate keyword');

  // Edit (must have been read first, exact match required)
  workspaceFileEdit({ path: 'test.txt', old_text: 'Line 2', new_text: 'Replaced Line', workspaceRoot: testDir });
  const editedContent = workspaceFileRead({ path: 'test.txt', workspaceRoot: testDir });
  assert(editedContent.includes('Replaced Line'), 'File edit should replace exact match');

  // Delete
  workspaceFileDelete({ path: 'test.txt', workspaceRoot: testDir });
  assert(!fs.existsSync(path.join(testDir, 'test.txt')), 'File should be deleted');

  console.log('✓ Workspace File Operations verified.\n');
} finally {
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {}
}

// 6. Model Provider Resolution
console.log('[Test 6] Verifying Model Provider Resolution...');
assert.strictEqual(resolveProviderForModel('gemini-3.8-flash'), 'gemini');
assert.strictEqual(resolveProviderForModel('meta-muse-spark'), 'muse');
assert.strictEqual(resolveProviderForModel('claude-3-5-sonnet-20241022'), 'anthropic');
assert.strictEqual(resolveProviderForModel('gpt-4o'), 'openai');
assert.strictEqual(resolveProviderForModel('deepseek-chat'), 'deepseek');
console.log('✓ Model Provider Resolution verified.\n');

// 7. DottaEngine Initialization
console.log('[Test 7] Verifying DottaEngine...');
const engine = new DottaEngine();
assert(typeof engine.run === 'function', 'engine.run should be a function');
console.log('✓ DottaEngine verified.\n');

// 8. Interrupt History & Auto-Resolution Persistence
console.log('[Test 8] Verifying Interrupt Persistence & Question History...');
import { recordInterruptHistory, getInterruptAnswer, deleteThread } from '../src/index.js';
const testThreadId = `test-thread-${Date.now()}`;
recordInterruptHistory(testThreadId, 'Which component should serve files?', 'File component');
const retrievedAnswer = getInterruptAnswer(testThreadId, 'Which component should serve files?');
assert.strictEqual(retrievedAnswer, 'File component', 'Recorded interrupt answer must match retrieved answer');
deleteThread(testThreadId);
console.log('✓ Interrupt Persistence and Question History verified.\n');

console.log('=========================================');
console.log('ALL DOTTA CORE TESTS PASSED SUCCESSFULLY!');
console.log('=========================================');
