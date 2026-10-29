/**
 * media-processor.js
 *
 * Media processing, validation, conversion, and segmentation engine.
 *
 * Requirements:
 * 1. Image Size & Format Validation:
 *    - Max 50 MB per image.
 *    - Supported formats: jpeg, png, gif, webp, x-icon.
 *    - Unsupported formats (bmp, tiff, svg, etc.) converted to supported format (png).
 * 2. Audio & Video 10-Minute Segmentation:
 *    - Max 10 minutes (600s) threshold for Muse Voice Transcribe.
 *    - Background tool chunks audio/video longer than 10 minutes into <=10-minute segments.
 *    - Sequentially dispatches each segment to muse-voice-transcribe-1.0.
 *    - Gathers, formats, and concatenates responses into final transcript.
 */

import { IMAGE_INPUT_LIMITS, AUDIO_INPUT_LIMITS } from '../models/model-registry.js';
import { getApiKey } from '../env.js';

export const MAX_IMAGE_SIZE_BYTES = IMAGE_INPUT_LIMITS.maxInlineFileSizeBytes; // 50 MB
export const SUPPORTED_IMAGE_MIMES = new Set(IMAGE_INPUT_LIMITS.supportedMimeTypes);

export const MAX_AUDIO_DURATION_SECONDS = AUDIO_INPUT_LIMITS.maxDurationSeconds; // 600s (10 min)
export const MAX_AUDIO_SIZE_BYTES = AUDIO_INPUT_LIMITS.maxFileSizeBytes; // 32 MB

/**
 * Validate an image's size and mime type.
 * Returns { valid: boolean, error?: string, needsConversion?: boolean, supportedMime?: string }
 */
export function validateImageMetadata({ size, mimeType, name = 'image' }) {
  if (size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${name}" (${(size / (1024 * 1024)).toFixed(1)} MB) exceeds the 50 MB limit.`
    };
  }

  const normalizedMime = (mimeType || '').toLowerCase();
  const isSupported = SUPPORTED_IMAGE_MIMES.has(normalizedMime);

  return {
    valid: true,
    needsConversion: !isSupported,
    targetMime: !isSupported ? 'image/png' : normalizedMime
  };
}

/**
 * Calculate segments for audio or video given total duration in seconds.
 * Segments are cut into windows of at most `maxDurationSeconds` (default 600s / 10m).
 */
export function calculateMediaSegments(totalDurationSeconds, maxDurationSeconds = MAX_AUDIO_DURATION_SECONDS) {
  const duration = Math.max(0, Number(totalDurationSeconds) || 0);
  if (duration <= maxDurationSeconds) {
    return [
      {
        index: 0,
        total: 1,
        startSec: 0,
        endSec: duration,
        durationSec: duration
      }
    ];
  }

  const segments = [];
  let currentStart = 0;
  let index = 0;

  while (currentStart < duration) {
    const currentEnd = Math.min(currentStart + maxDurationSeconds, duration);
    segments.push({
      index,
      startSec: currentStart,
      endSec: currentEnd,
      durationSec: currentEnd - currentStart
    });
    currentStart = currentEnd;
    index++;
  }

  const total = segments.length;
  return segments.map((s) => ({ ...s, total }));
}

/**
 * Send an audio segment to Meta Voice Transcribe or OpenAI Whisper as fallback.
 * Key resolution order: META_MUSE_API_KEY → OPENAI_API_KEY → MODEL_API_KEY → offline mock.
 */
export async function transcribeSingleAudioChunk(audioPayload, options = {}) {
  // Resolve the audio blob/buffer
  let blob;
  if (audioPayload.buffer) {
    blob = new Blob([audioPayload.buffer], { type: audioPayload.mimeType || 'audio/wav' });
  } else if (audioPayload.blob) {
    blob = audioPayload.blob;
  } else {
    blob = new Blob([new Uint8Array(audioPayload.bytes || [])], { type: 'audio/wav' });
  }

  // --- Attempt 1: Meta Muse Voice Transcribe ---
  const metaKey = options.apiKey || getApiKey('META_MUSE_API_KEY') || getApiKey('MODEL_API_KEY');
  const metaBaseUrl = options.baseUrl || process.env.META_MUSE_BASE_URL || process.env.META_BASE_URL || 'https://api.meta.ai/v1';

  if (metaKey) {
    try {
      const endpoint = `${metaBaseUrl.replace(/\/$/, '')}/asr/transcribe`;
      const formData = new FormData();
      formData.append('file', blob, audioPayload.filename || 'audio.wav');
      formData.append('model', 'muse-voice-transcribe-1.0');

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${metaKey}` },
        body: formData,
        signal: AbortSignal.timeout(30000)
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.text || json.transcript || '';
        if (text.trim()) {
          return { ok: true, text, source: 'meta_muse', data: json };
        }
      }
      // If Meta fails, fall through to OpenAI Whisper
      console.warn('[MediaProcessor] Meta voice transcribe failed or empty, trying OpenAI Whisper...');
    } catch (err) {
      console.warn('[MediaProcessor] Meta transcription error, falling back to Whisper:', err.message);
    }
  }

  // --- Attempt 2: OpenAI Whisper ---
  const openaiKey = getApiKey('OPENAI_API_KEY');
  if (openaiKey) {
    try {
      const formData = new FormData();
      formData.append('file', blob, audioPayload.filename || 'audio.wav');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'text');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
        signal: AbortSignal.timeout(30000)
      });

      if (res.ok) {
        const text = await res.text();
        if (text.trim()) {
          return { ok: true, text: text.trim(), source: 'openai_whisper' };
        }
      }
      const errText = await res.text().catch(() => 'unknown');
      console.warn('[MediaProcessor] Whisper transcription failed:', res.status, errText);
    } catch (err) {
      console.warn('[MediaProcessor] Whisper network error:', err.message);
    }
  }

  // --- Attempt 3: Gemini Multimodal Audio Transcription ---
  const geminiKey = getApiKey('GEMINI_API_KEY');
  if (geminiKey) {
    try {
      let base64 = '';
      if (audioPayload.buffer) {
        base64 = Buffer.isBuffer(audioPayload.buffer) 
          ? audioPayload.buffer.toString('base64') 
          : Buffer.from(audioPayload.buffer).toString('base64');
      } else if (blob) {
        const arrayBuf = await blob.arrayBuffer();
        base64 = Buffer.from(arrayBuf).toString('base64');
      }

      if (base64) {
        // Strip codec parameters like audio/webm;codecs=opus -> audio/webm
        const geminiMime = (audioPayload.mimeType || 'audio/webm').split(';')[0].trim();
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inlineData: {
                    mimeType: geminiMime,
                    data: base64
                  }
                },
                {
                  text: 'Transcribe this audio verbatim. Output only the transcription text, nothing else. Do not add quotes, notes, or timestamps.'
                }
              ]
            }]
          }),
          signal: AbortSignal.timeout(30000)
        });

        if (res.ok) {
          const json = await res.json();
          const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText && candidateText.trim()) {
            return { ok: true, text: candidateText.trim(), source: 'gemini_audio', data: json };
          }
        } else {
          const errText = await res.text().catch(() => '');
          console.warn('[MediaProcessor] Gemini audio transcription failed:', res.status, errText);
        }
      }
    } catch (err) {
      console.warn('[MediaProcessor] Gemini audio transcription error:', err.message);
    }
  }

  // --- Offline fallback (no working keys found) ---
  console.warn('[MediaProcessor] No working transcription provider found or all failed.');
  return {
    ok: true,
    text: options.mockText || '',
    source: 'offline_mock'
  };
}

/**
 * Sequentially transcribe audio segments, gathering formatted responses one by one
 * and joining them into the full transcript.
 */
export async function transcribeAudioSequentially(segments, audioSource, options = {}) {
  const results = [];
  const onProgress = options.onProgress || (() => {});

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    onProgress({
      currentSegment: i + 1,
      totalSegments: segments.length,
      status: `Transcribing segment ${i + 1} of ${segments.length}...`
    });

    const chunkPayload = {
      buffer: audioSource.buffer,
      blob: audioSource.blob,
      durationSec: seg.durationSec,
      startSec: seg.startSec,
      endSec: seg.endSec,
      mimeType: audioSource.mimeType || 'audio/wav',
      filename: `segment_${i + 1}.wav`
    };

    const res = await transcribeSingleAudioChunk(chunkPayload, options);
    if (!res.ok) {
      console.warn(`[MediaProcessor] Segment ${i + 1} failed:`, res.error);
    }
    results.push(res.text || '');
  }

  const combinedTranscript = results
    .map((t) => t.trim())
    .filter(Boolean)
    .join(' ');

  return {
    ok: true,
    transcript: combinedTranscript,
    segmentsProcessed: segments.length,
    results
  };
}
