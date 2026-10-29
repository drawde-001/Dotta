import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseSamSegmentationOutput,
  executeSegmentImage
} from '../src/core/tools/sam-tool.js';
import {
  checkToolRunCap,
  checkPermission,
  COST_BEARING_TOOL_CAPS
} from '../src/core/tools/policy.js';
import {
  MODEL_REGISTRY,
  getModelRegistry,
  getSelectableModels
} from '../src/core/models/model-registry.js';
import { createWorkspace } from '../src/core/execution/workspace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('--- Starting SAM 3.1 & Tool Policy Tests ---');

// 1. Test SAM 3.1 Model Registry Entry
console.log('\n[Test 1] Verifying sam-3.1 registry entry...');
assert(MODEL_REGISTRY['sam-3.1'], 'sam-3.1 must exist in MODEL_REGISTRY');
assert.strictEqual(MODEL_REGISTRY['sam-3.1'].selectable, false, 'sam-3.1 must have selectable: false');
assert.strictEqual(MODEL_REGISTRY['sam-3.1'].capabilities.segmentation, true, 'sam-3.1 must have segmentation capability');
assert.strictEqual(MODEL_REGISTRY['sam-3.1'].capabilities.text, false, 'sam-3.1 is not a chat model');
const selectable = getSelectableModels().map((m) => m.id);
assert(!selectable.includes('sam-3.1'), 'sam-3.1 must NOT appear in selectable models');
console.log('✓ sam-3.1 registry entry verified.');

// 2. Test Parser for Wire Grammar
console.log('\n[Test 2] Verifying parseSamSegmentationOutput...');
const sampleWire = '<0f>0<|box;x1=100;y1=150;x2=300;y2=400;w=800;h=600;c=0.95|><|mask;x=0;y=0;c=0.95;data=25,50,~payload1|>,1<|box;x1=450;y1=200;x2=650;y2=500;w=800;h=600;c=0.88|><|mask;x=0;y=0;c=0.88;data=30,40,~payload2|>';
const parsed = parseSamSegmentationOutput(sampleWire);
assert.strictEqual(parsed.length, 2, 'Should parse 2 object records');
assert.strictEqual(parsed[0].objectId, 0);
assert.strictEqual(parsed[0].box.x1, 100);
assert.strictEqual(parsed[0].box.x2, 300);
assert.strictEqual(parsed[0].confidence, 0.95);
assert.strictEqual(parsed[1].objectId, 1);
assert.strictEqual(parsed[1].box.x1, 450);
console.log('✓ Wire grammar parsing verified.');

// 3. Test Tool-Policy Permission & Cost-Bearing Caps
console.log('\n[Test 3] Verifying tool-policy and per-run caps...');
const permCheck = checkPermission('segment_image', { image_path: 'photo.png', prompt: 'cat' });
assert.strictEqual(permCheck.decision, 'allow', 'segment_image must be allowed by tool-policy');

assert.strictEqual(checkToolRunCap('segment_image', 5).allowed, true);
assert.strictEqual(checkToolRunCap('segment_image', 9).allowed, true);
assert.strictEqual(checkToolRunCap('segment_image', 10).allowed, false);
assert.strictEqual(COST_BEARING_TOOL_CAPS.segment_image, 10);
console.log('✓ Tool permission and per-run caps verified.');

// Setup temporary test workspace
const testRunId = `test-sam-${Date.now()}`;
const wsMeta = createWorkspace(testRunId);
const wsRoot = wsMeta.workspaceRoot;

// Create dummy BMP image inside workspace
const dummyImageRel = 'test_sample.bmp';
const dummyImageAbs = path.join(wsRoot, dummyImageRel);

// 2x2 BMP file buffer (58 bytes)
const dummyBmpHeader = Buffer.from([
  0x42, 0x4D, 0x3A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x36, 0x00, 0x00, 0x00,
  0x28, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00,
  0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x00, 0x00, // row 1
  0x00, 0x00, 0xFF, 0x00, 0xFF, 0xFF, 0x00, 0x00  // row 2
]);
fs.writeFileSync(dummyImageAbs, dummyBmpHeader);

try {
  // 4. Test Mocked Successful Call
  console.log('\n[Test 4] Verifying segment_image with mocked provider (successful match)...');
  const mockSuccess = async () => sampleWire;

  const resOk = await executeSegmentImage(
    { image_path: dummyImageRel, prompt: 'yellow school bus' },
    { workspaceRoot: wsRoot, mockProvider: mockSuccess }
  );

  assert.strictEqual(resOk.status, 'ok');
  assert.strictEqual(resOk.data.matches, 2);
  assert(resOk.data.annotatedImage, 'Must return annotated image reference');
  assert(resOk.data.rawResult, 'Must return raw result JSON reference');
  assert(!resOk.output.includes('data:image'), 'Must never put base64 in output');
  assert(!resOk.output.includes('payload'), 'Must never put raw mask payload in output');
  assert(fs.existsSync(path.join(wsRoot, resOk.data.annotatedImage)), 'Annotated file must exist in workspace');
  assert(fs.existsSync(path.join(wsRoot, resOk.data.rawResult)), 'Raw result file must exist in workspace');
  console.log('✓ Mocked success execution verified.');

  // 5. Test Empty Case (Zero Matches is 'empty', not an error)
  console.log('\n[Test 5] Verifying zero matches returns "empty"...');
  const mockEmpty = async () => '';

  const resEmpty = await executeSegmentImage(
    { image_path: dummyImageRel, prompt: 'nonexistent object' },
    { workspaceRoot: wsRoot, mockProvider: mockEmpty }
  );

  assert.strictEqual(resEmpty.status, 'empty');
  assert.strictEqual(resEmpty.data.matches, 0);
  assert(resEmpty.output.includes('No objects matching prompt'), 'Should describe zero matches gracefully');
  console.log('✓ Zero matches returns "empty" status verified.');

  // 6. Test Error Cases (Missing File, Path Traversal, Bad Arguments)
  console.log('\n[Test 6] Verifying error cases...');
  const resBadPath = await executeSegmentImage(
    { image_path: '../sensitive.env', prompt: 'key' },
    { workspaceRoot: wsRoot, mockProvider: mockSuccess }
  );
  assert.strictEqual(resBadPath.status, 'permanent_error');
  assert(resBadPath.output.includes('denied or invalid') || resBadPath.output.includes('strictly prohibited'));

  const resMissing = await executeSegmentImage(
    { image_path: 'does_not_exist.png', prompt: 'object' },
    { workspaceRoot: wsRoot, mockProvider: mockSuccess }
  );
  assert.strictEqual(resMissing.status, 'permanent_error');
  assert(resMissing.output.includes('does not exist'));

  // 7. Test Transient / Retryable Error Mapping
  const mockRetryable = async () => {
    const err = new Error('Gateway timeout 503');
    throw err;
  };
  const resTransient = await executeSegmentImage(
    { image_path: dummyImageRel, prompt: 'bus' },
    { workspaceRoot: wsRoot, mockProvider: mockRetryable }
  );
  assert.strictEqual(resTransient.status, 'retryable_error');
  console.log('✓ Error handling and typed statuses verified.');

  // 8. Test Live / Fallback Real Call
  console.log('\n[Test 8] Performing small call with executeSegmentImage...');
  const realRes = await executeSegmentImage(
    { image_path: dummyImageRel, prompt: 'color patch' },
    { workspaceRoot: wsRoot }
  );
  console.log('Real execution output status:', realRes.status);
  console.log('Real execution output snippet:\n' + realRes.output);

  console.log('\n=========================================');
  console.log('ALL SAM 3.1 TESTS PASSED SUCCESSFULLY!');
  console.log('=========================================');
} finally {
  // Clean up test workspace
  try {
    fs.rmSync(wsRoot, { recursive: true, force: true });
  } catch {}
}
