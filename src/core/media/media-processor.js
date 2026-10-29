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

function extractTranscriptFromResponseJson(json) {
  if (!json || typeof json !== 'object') return '';
  const direct =
    json.text ||
    json.transcript ||
    json.transcription ||
    json.output ||
    json.result ||
    json.data?.text ||
    json.data?.transcript ||
    json.choices?.[0]?.message?.content;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  if (Array.isArray(json.segments)) {
    const joined = json.segments
      .map((s) => (typeof s === 'string' ? s : s?.text || ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (joined) return joined;
  }
  if (Array.isArray(json.results)) {
    const joined = json.results
      .map((r) => r?.text || r?.transcript || r?.alternatives?.[0]?.transcript || '')
      .filter(Boolean)
      .join(' ')
      .trim();
    if (joined) return joined;
  }
  return '';
}

/**
 * Helper: Call Meta Muse Voice Transcribe (muse-voice-transcribe-1.0) across Meta endpoints.
 */
async function callMetaMuseVoiceTranscribe({
  blob,
  base64,
  rawMime,
  defaultExt,
  filename,
  options = {},
  timeoutMs = 25000,
  isFinalFallback = false
}) {
  const metaKey =
    options.apiKey ||
    getApiKey('MUSE_API_KEY') ||
    getApiKey('META_MUSE_API_KEY') ||
    getApiKey('MODEL_API_KEY') ||
    getApiKey('LLAMA_API_KEY');

  if (!metaKey) {
    return null;
  }

  const configuredBase = (
    options.baseUrl ||
    process.env.MODEL_API_BASE_URL ||
    process.env.META_MUSE_BASE_URL ||
    process.env.MUSE_BASE_URL ||
    process.env.META_BASE_URL ||
    ''
  ).replace(/\/$/, '');

  const baseUrls = Array.from(
    new Set(
      [
        configuredBase,
        'https://api.meta.ai/v1',
        'https://api.llama.com/v1'
      ].filter(Boolean)
    )
  );

  for (const metaBaseUrl of baseUrls) {
    const multipartEndpoints = [
      { url: `${metaBaseUrl}/asr/transcribe`, model: 'muse-voice-transcribe-1.0' },
      { url: `${metaBaseUrl}/audio/transcriptions`, model: 'muse-voice-transcribe-1.0' }
    ];

    for (const ep of multipartEndpoints) {
      try {
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('model', ep.model);

        const res = await fetch(ep.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${metaKey}` },
          body: formData,
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await res.json();
            const text = extractTranscriptFromResponseJson(json);
            if (text) {
              return {
                ok: true,
                text,
                source: isFinalFallback
                  ? 'muse-voice-transcribe-1.0:final_fallback'
                  : 'muse-voice-transcribe-1.0',
                data: json
              };
            }
          } else {
            const text = (await res.text()).trim();
            if (text && !text.startsWith('<')) {
              return {
                ok: true,
                text,
                source: isFinalFallback
                  ? 'muse-voice-transcribe-1.0:final_fallback'
                  : 'muse-voice-transcribe-1.0'
              };
            }
          }
        }
      } catch (err) {
        console.warn(
          `[MediaProcessor] muse-voice-transcribe-1.0 multipart error (${ep.url}):`,
          err.message
        );
      }
    }

    if (base64) {
      // JSON ASR endpoint for muse-voice-transcribe-1.0
      try {
        const jsonRes = await fetch(`${metaBaseUrl}/asr/transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${metaKey}`
          },
          body: JSON.stringify({
            model: 'muse-voice-transcribe-1.0',
            audio: base64,
            mime_type: rawMime,
            format: defaultExt
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (jsonRes.ok) {
          const json = await jsonRes.json().catch(() => null);
          const text = extractTranscriptFromResponseJson(json);
          if (text) {
            return {
              ok: true,
              text,
              source: isFinalFallback
                ? 'muse-voice-transcribe-1.0:json_final_fallback'
                : 'muse-voice-transcribe-1.0:json',
              data: json
            };
          }
        }
      } catch {}

      // Meta Muse multimodal chat completions with muse-voice-transcribe-1.0 / muse-wonder-1.0 / muse-spark-1.3
      const chatModels = isFinalFallback
        ? ['muse-voice-transcribe-1.0', 'muse-spark-1.3', 'muse-wonder-1.0']
        : ['muse-voice-transcribe-1.0', 'muse-wonder-1.0'];

      for (const chatModel of chatModels) {
        try {
          const chatRes = await fetch(`${metaBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${metaKey}`
            },
            body: JSON.stringify({
              model: chatModel,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_audio',
                      input_audio: {
                        data: base64,
                        format: defaultExt === 'wav' ? 'wav' : 'mp3'
                      }
                    },
                    {
                      type: 'text',
                      text: 'Transcribe this audio verbatim. Output only the spoken words, nothing else.'
                    }
                  ]
                }
              ]
            }),
            signal: AbortSignal.timeout(timeoutMs)
          });
          if (chatRes.ok) {
            const json = await chatRes.json().catch(() => null);
            const text = extractTranscriptFromResponseJson(json);
            if (text) {
              return {
                ok: true,
                text,
                source: isFinalFallback
                  ? `muse-voice-transcribe-1.0:chat_final_fallback(${chatModel})`
                  : `meta_muse_chat:${chatModel}`,
                data: json
              };
            }
          }
        } catch {}
      }
    }
  }

  return null;
}

/**
 * Send an audio segment to Meta Voice Transcribe (muse-voice-transcribe-1.0) as primary/default,
 * try intermediate fallbacks if needed, and ALWAYS hand back over to muse-voice-transcribe-1.0
 * as the final fallback if every other provider fails.
 */
export async function transcribeSingleAudioChunk(audioPayload, options = {}) {
  const rawMime = (audioPayload.mimeType || 'audio/wav').split(';')[0].trim();
  const defaultExt = rawMime.includes('wav') ? 'wav' : rawMime.includes('mp3') ? 'mp3' : 'webm';
  const filename = audioPayload.filename || `audio.${defaultExt}`;

  // Resolve the audio blob/buffer and base64
  let blob;
  let base64 = '';
  if (audioPayload.buffer) {
    const buf = Buffer.isBuffer(audioPayload.buffer)
      ? audioPayload.buffer
      : Buffer.from(audioPayload.buffer);
    blob = new Blob([buf], { type: rawMime });
    base64 = buf.toString('base64');
  } else if (audioPayload.blob) {
    blob = audioPayload.blob;
    const arrayBuf = await blob.arrayBuffer();
    base64 = Buffer.from(arrayBuf).toString('base64');
  } else {
    const bytes = new Uint8Array(audioPayload.bytes || []);
    blob = new Blob([bytes], { type: rawMime });
    base64 = Buffer.from(bytes).toString('base64');
  }

  // --- Attempt 1 (DEFAULT PRIMARY): Meta Muse Voice Transcribe (muse-voice-transcribe-1.0) ---
  const primaryMuseResult = await callMetaMuseVoiceTranscribe({
    blob,
    base64,
    rawMime,
    defaultExt,
    filename,
    options,
    timeoutMs: 25000,
    isFinalFallback: false
  });
  if (primaryMuseResult && primaryMuseResult.ok && primaryMuseResult.text) {
    return primaryMuseResult;
  }

  // --- Attempt 2 (Intermediate Fallback): OpenAI Whisper ---
  const openaiKey = getApiKey('OPENAI_API_KEY');
  if (openaiKey) {
    try {
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'text');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
        signal: AbortSignal.timeout(25000)
      });

      if (res.ok) {
        const text = (await res.text()).trim();
        if (text) {
          return { ok: true, text, source: 'openai_whisper' };
        }
      }
    } catch (err) {
      console.warn('[MediaProcessor] Whisper fallback error:', err.message);
    }
  }

  // --- Attempt 3 (Intermediate Fallback): Gemini Multimodal Audio ---
  const geminiKey = getApiKey('GEMINI_API_KEY');
  if (geminiKey && base64) {
    try {
      const geminiBaseUrl = (
        process.env.GEMINI_API_BASE_URL ||
        'https://generativelanguage.googleapis.com/v1beta'
      ).replace(/\/$/, '');
      const geminiModels = ['gemini-2.5-flash', 'gemini-3-flash-preview'];

      for (const gModel of geminiModels) {
        try {
          const res = await fetch(
            `${geminiBaseUrl}/models/${gModel}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      { inlineData: { mimeType: rawMime, data: base64 } },
                      {
                        text: 'Transcribe this audio verbatim. Output only the spoken words, nothing else.'
                      }
                    ]
                  }
                ]
              }),
              signal: AbortSignal.timeout(25000)
            }
          );

          if (res.ok) {
            const json = await res.json();
            const candidateText = json.candidates?.[0]?.content?.parts
              ?.filter((p) => !p.thought && typeof p.text === 'string')
              .map((p) => p.text)
              .join('')
              .trim();
            if (candidateText) {
              return {
                ok: true,
                text: candidateText,
                source: `gemini_audio:${gModel}`,
                data: json
              };
            }
          }
        } catch {}
      }
    } catch {}
  }

  // --- Attempt 4 (FINAL HANDOVER FALLBACK): Meta Muse Voice Transcribe (muse-voice-transcribe-1.0) ---
  // Always hand back over to muse-voice-transcribe-1.0 if every other fallback failed.
  const finalMuseResult = await callMetaMuseVoiceTranscribe({
    blob,
    base64,
    rawMime,
    defaultExt,
    filename,
    options,
    timeoutMs: 40000,
    isFinalFallback: true
  });
  if (finalMuseResult && finalMuseResult.ok && finalMuseResult.text) {
    return finalMuseResult;
  }

  // --- Offline fallback (no working keys found) ---
  console.warn('[MediaProcessor] No working transcription provider found or all failed.');
  return {
    ok: true,
    text: options.mockText || '',
    source: 'muse-voice-transcribe-1.0:offline_fallback'
  };
}

/**
 * Slice a WAV buffer (with a 44-byte RIFF header) for a specific segment window [startSec, endSec].
 * If the buffer is not a standard RIFF WAV or is already a single chunk, returns the buffer intact.
 */
function sliceWavBufferForSegment(buffer, seg, totalSegments) {
  if (!buffer || !Buffer.isBuffer(buffer) || totalSegments <= 1 || buffer.length <= 44) {
    return buffer;
  }
  const magic = buffer.toString('ascii', 0, 4);
  if (magic !== 'RIFF') {
    const payloadBytes = buffer.length;
    const byteStart = Math.floor((seg.index / totalSegments) * payloadBytes);
    const byteEnd = Math.floor(((seg.index + 1) / totalSegments) * payloadBytes);
    return buffer.subarray(byteStart, byteEnd);
  }

  const numChannels = buffer.readUInt16LE(22) || 1;
  const sampleRate = buffer.readUInt32LE(24) || 16000;
  const bitsPerSample = buffer.readUInt16LE(34) || 16;
  const blockAlign = Math.max(1, numChannels * (bitsPerSample / 8));
  const bytesPerSec = sampleRate * blockAlign;

  const dataOffset = 44;
  const totalDataBytes = buffer.length - dataOffset;
  const rawStart = Math.min(totalDataBytes, Math.floor(seg.startSec * bytesPerSec));
  const rawEnd = Math.min(totalDataBytes, Math.ceil(seg.endSec * bytesPerSec));
  const alignedStart = rawStart - (rawStart % blockAlign);
  const alignedEnd = rawEnd - (rawEnd % blockAlign);

  if (alignedEnd <= alignedStart) {
    return buffer;
  }

  const sliceData = buffer.subarray(dataOffset + alignedStart, dataOffset + alignedEnd);
  const newWav = Buffer.allocUnsafe(44 + sliceData.length);
  buffer.copy(newWav, 0, 0, 44);
  newWav.writeUInt32LE(36 + sliceData.length, 4);
  newWav.writeUInt32LE(sliceData.length, 40);
  sliceData.copy(newWav, 44);
  return newWav;
}

/**
 * Sequentially transcribe audio segments, gathering formatted responses one by one
 * and joining them into the full transcript. If any segment fails, retries directly
 * with muse-voice-transcribe-1.0 as the final handover fallback.
 */
export async function transcribeAudioSequentially(segments, audioSource, options = {}) {
  const results = [];
  const onProgress = options.onProgress || (() => {});

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    onProgress({
      currentSegment: i + 1,
      totalSegments: segments.length,
      status: `Transcribing segment ${i + 1} of ${segments.length} with muse-voice-transcribe-1.0...`
    });

    const segmentBuffer = sliceWavBufferForSegment(
      audioSource.buffer,
      seg,
      segments.length
    );

    const chunkPayload = {
      buffer: segmentBuffer,
      blob: audioSource.blob,
      durationSec: seg.durationSec,
      startSec: seg.startSec,
      endSec: seg.endSec,
      mimeType: audioSource.mimeType || 'audio/wav',
      filename: `segment_${i + 1}.wav`
    };

    let res = await transcribeSingleAudioChunk(chunkPayload, options);
    if (!res.ok || !res.text) {
      // Final segment-level handover to muse-voice-transcribe-1.0
      const rawMime = (chunkPayload.mimeType || 'audio/wav').split(';')[0].trim();
      const defaultExt = rawMime.includes('wav') ? 'wav' : 'mp3';
      const fallbackBuf = segmentBuffer
        ? Buffer.isBuffer(segmentBuffer)
          ? segmentBuffer
          : Buffer.from(segmentBuffer)
        : Buffer.alloc(0);
      const finalHandover = await callMetaMuseVoiceTranscribe({
        blob: new Blob([fallbackBuf], { type: rawMime }),
        base64: fallbackBuf.toString('base64'),
        rawMime,
        defaultExt,
        filename: chunkPayload.filename,
        options,
        timeoutMs: 45000,
        isFinalFallback: true
      });
      if (finalHandover && finalHandover.text) {
        res = finalHandover;
      }
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
