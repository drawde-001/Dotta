/**
 * tests/media-processor.test.js
 *
 * Verifies:
 * 1. Image metadata validation and 50 MB limit enforcement.
 * 2. Unsupported image format detection (triggering client/server conversion).
 * 3. Audio & video 10-minute (600s) segmentation calculation.
 * 4. Sequential audio transcription across chunks and concatenated transcript gathering.
 */

import assert from 'assert';
import {
  validateImageMetadata,
  calculateMediaSegments,
  transcribeAudioSequentially,
  transcribeSingleAudioChunk,
  getSameFamilyModelCandidates,
  isMetaFamilyModel,
  isAudioTranscriptionRefusal,
  MAX_IMAGE_SIZE_BYTES,
  MAX_AUDIO_DURATION_SECONDS
} from '../src/core/media/media-processor.js';

console.log('--- Starting Media Processor & Audio Segmentation Tests ---\n');

// [Test 1] Image 50 MB Limit & Validation
console.log('[Test 1] Verifying Image Size Limit (50 MB) & Metadata Validation...');
const smallPng = validateImageMetadata({
  size: 1024 * 1024, // 1 MB
  mimeType: 'image/png',
  name: 'test.png'
});
assert.strictEqual(smallPng.valid, true);
assert.strictEqual(smallPng.needsConversion, false);

const oversizedImage = validateImageMetadata({
  size: 51 * 1024 * 1024, // 51 MB > 50 MB limit
  mimeType: 'image/jpeg',
  name: 'huge.jpg'
});
assert.strictEqual(oversizedImage.valid, false);
assert.ok(oversizedImage.error.includes('50 MB limit'));
console.log('✓ Image 50 MB limit correctly validated.');

// [Test 2] Unsupported Format Detection for Background Conversion
console.log('\n[Test 2] Verifying Unsupported Format Detection...');
const bmpImage = validateImageMetadata({
  size: 2 * 1024 * 1024,
  mimeType: 'image/bmp',
  name: 'drawing.bmp'
});
assert.strictEqual(bmpImage.valid, true);
assert.strictEqual(bmpImage.needsConversion, true);
assert.strictEqual(bmpImage.targetMime, 'image/png');

const tiffImage = validateImageMetadata({
  size: 500000,
  mimeType: 'image/tiff',
  name: 'scan.tiff'
});
assert.strictEqual(tiffImage.valid, true);
assert.strictEqual(tiffImage.needsConversion, true);
assert.strictEqual(tiffImage.targetMime, 'image/png');
console.log('✓ Unsupported formats correctly identified for background conversion.');

// [Test 3] 10-Minute Segmentation for Audio / Video
console.log('\n[Test 3] Verifying 10-Minute (600s) Threshold Segmentation...');
// Case A: 5-minute audio (<= 600s)
const shortAudioSegments = calculateMediaSegments(300, 600);
assert.strictEqual(shortAudioSegments.length, 1);
assert.strictEqual(shortAudioSegments[0].durationSec, 300);

// Case B: 25-minute audio (1500s) -> should yield 3 segments: [600, 600, 300]
const longAudioSegments = calculateMediaSegments(1500, 600);
assert.strictEqual(longAudioSegments.length, 3);
assert.strictEqual(longAudioSegments[0].startSec, 0);
assert.strictEqual(longAudioSegments[0].endSec, 600);
assert.strictEqual(longAudioSegments[1].startSec, 600);
assert.strictEqual(longAudioSegments[1].endSec, 1200);
assert.strictEqual(longAudioSegments[2].startSec, 1200);
assert.strictEqual(longAudioSegments[2].endSec, 1500);
assert.strictEqual(longAudioSegments[2].durationSec, 300);
console.log('✓ 10-minute segmentation correctly splits long recordings.');

// [Test 4] Sequential Transcription Gathering
console.log('\n[Test 4] Verifying Sequential Audio Chunk Gathering...');
const segmentsToProcess = calculateMediaSegments(1300, 600); // 3 segments
const progressReports = [];

const transcriptionResult = await transcribeAudioSequentially(
  segmentsToProcess,
  { buffer: Buffer.from('RIFF_WAV_SIMULATED_DATA'), mimeType: 'audio/wav' },
  {
    mockText: 'Hello Dotta test segment.',
    onProgress: (p) => progressReports.push(p)
  }
);

assert.strictEqual(transcriptionResult.ok, true);
assert.strictEqual(transcriptionResult.segmentsProcessed, 3);
assert.strictEqual(progressReports.length, 3);
assert.strictEqual(
  transcriptionResult.transcript,
  'Hello Dotta test segment. Hello Dotta test segment. Hello Dotta test segment.'
);
console.log('✓ Sequential chunk transcription and gathering verified.');

// [Test 5] Verifying Meta Family Same-Family Hierarchy Ordering
console.log('\n[Test 5] Verifying Meta Same-Family Hierarchy & Candidate Ordering...');
assert.strictEqual(isMetaFamilyModel('muse-spark-open'), true);
assert.strictEqual(isMetaFamilyModel('meta-models/Muse-Spark-Open-816B-A42B'), true);
assert.strictEqual(isMetaFamilyModel('generic-text-model'), false);
assert.strictEqual(isMetaFamilyModel('external-custom-70b'), false);

const metaCandidates = getSameFamilyModelCandidates('muse-spark-open');
assert.strictEqual(metaCandidates.family, 'meta');
// Crucial: muse-voice-transcribe-1.0 MUST be the very first candidate
assert.strictEqual(
  metaCandidates.models[0],
  'muse-voice-transcribe-1.0',
  'muse-voice-transcribe-1.0 must be the first candidate model for Meta audio'
);
// All subsequent models must be in the same Meta family
assert.ok(metaCandidates.models.includes('meta-models/Muse-Spark-Open-816B-A42B'));
assert.ok(metaCandidates.models.includes('muse-spark-open'));
assert.ok(metaCandidates.models.includes('muse-wonder-1.0'));
assert.ok(metaCandidates.models.includes('muse-spark-1.3'));
console.log('✓ Meta same-family candidate ordering verified: muse-voice-transcribe-1.0 is #1.');

// [Test 6] Verifying Audio Transcription Refusal Detection
console.log('\n[Test 6] Verifying Audio Transcription Refusal Detection...');
const refusal1 = "I don't have the ability to listen to or process audio files, so I can't transcribe what was said. If you can provide a text transcript...";
const refusal2 = "I'm sorry, but I don't have access to any audio in this chat. If you can provide a text transcript...";
const refusal3 = "No audio was included in your message, so I can't transcribe it.";
const refusal4 = "No audio file was provided with your request, so there are no spoken words to transcribe.";
const refusal5 = "I don't have the ability to listen to or transcribe audio files, and no audio transcript was provided in your message, so I can't generate a verbatim transcription. If you can provide the text or a description of what you need help with, I'm happy to assist with formatting, editing, or summarizing it.";
const validTranscript1 = "You can choose between four preset positions.";
const validTranscript2 = "Schedule a meeting with Sarah for tomorrow at 2 PM.";

assert.strictEqual(isAudioTranscriptionRefusal(refusal1), true);
assert.strictEqual(isAudioTranscriptionRefusal(refusal2), true);
assert.strictEqual(isAudioTranscriptionRefusal(refusal3), true);
assert.strictEqual(isAudioTranscriptionRefusal(refusal4), true);
assert.strictEqual(isAudioTranscriptionRefusal(refusal5), true);
assert.strictEqual(isAudioTranscriptionRefusal(validTranscript1), false);
assert.strictEqual(isAudioTranscriptionRefusal(validTranscript2), false);
console.log('✓ Audio transcription refusal detection correctly discriminates refusals from transcripts.');

// [Test 7] Verifying Hard Gate: KEY_REQUIRED when no user key is provided
console.log('\n[Test 7] Verifying Hard Gate: KEY_REQUIRED when no user credentials...');
const noKeyResult = await transcribeSingleAudioChunk({
  buffer: Buffer.from('RIFF_WAV_SIMULATED_DATA'),
  mimeType: 'audio/wav'
});
assert.strictEqual(noKeyResult.ok, false);
assert.strictEqual(noKeyResult.code, 'KEY_REQUIRED');
assert.ok(noKeyResult.error.includes('Meta API key is required'));
console.log('✓ Hard gate verified: Audio chunk transcription returns KEY_REQUIRED with zero credentials.');

console.log('\n======================================================');
console.log('ALL MEDIA PROCESSOR & AUDIO TESTS PASSED SUCCESSFULLY!');
console.log('======================================================\n');
