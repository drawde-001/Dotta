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
import { getApiKey, getGeminiApiKeys } from '../env.js';

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
  const modalToken =
    process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET
      ? `${process.env.MODAL_PROXY_TOKEN_ID}.${process.env.MODAL_PROXY_TOKEN_SECRET}`
      : process.env.MODAL_API_KEY;

  const metaKey =
    options.apiKey ||
    modalToken ||
    getApiKey('MUSE_API_KEY') ||
    getApiKey('META_MUSE_API_KEY') ||
    getApiKey('MODEL_API_KEY') ||
    getApiKey('LLAMA_API_KEY');

  if (!metaKey) {
    return null;
  }

  const configuredBase = (
    options.baseUrl ||
    process.env.MODAL_MUSE_SPARK_URL ||
    process.env.MODEL_API_BASE_URL ||
    process.env.META_MUSE_BASE_URL ||
    process.env.MUSE_BASE_URL ||
    process.env.META_BASE_URL ||
    'https://edelobi--ep-muse-spark-open-816b-a42b-server.us-west.modal.direct/v1'
  ).replace(/\/$/, '');

  const baseUrls = Array.from(
    new Set(
      [
        configuredBase,
        process.env.MODEL_API_BASE_URL,
        process.env.META_MUSE_BASE_URL,
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

      // Meta Muse multimodal chat completions with muse-voice-transcribe-1.0 / meta-models/Muse-Spark-Open-816B-A42B / muse-spark-1.3 / muse-wonder-1.0
      const chatModels = isFinalFallback
        ? ['muse-voice-transcribe-1.0', 'meta-models/Muse-Spark-Open-816B-A42B', 'muse-spark-open', 'muse-spark-1.3', 'muse-wonder-1.0']
        : ['muse-voice-transcribe-1.0', 'meta-models/Muse-Spark-Open-816B-A42B', 'muse-spark-open', 'muse-wonder-1.0'];

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
 * Helper: Call Meta Muse Spark Open via Modal vLLM endpoint natively with input_audio.
 * The model itself transcribes the audio natively without third-party services.
 */
export async function callModalMuseSparkAudio({
  base64,
  rawMime = 'audio/wav',
  timeoutMs = 25000
} = {}) {
  const modalToken =
    process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET
      ? `${process.env.MODAL_PROXY_TOKEN_ID}.${process.env.MODAL_PROXY_TOKEN_SECRET}`
      : process.env.MODAL_API_KEY;

  const key = modalToken || getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY');
  if (!key || !base64) return null;

  const modalUrl = (
    process.env.MODAL_MUSE_SPARK_URL ||
    'https://edelobi--ep-muse-spark-open-816b-a42b-server.us-west.modal.direct/v1'
  ).replace(/\/+$/, '');

  const format = rawMime.includes('mp3') ? 'mp3' : 'wav';

  try {
    const res = await fetch(`${modalUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'meta-models/Muse-Spark-Open-816B-A42B',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: base64,
                  format
                }
              },
              {
                type: 'text',
                text: 'Transcribe this audio verbatim. Output only the spoken words, nothing else.'
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (res.ok) {
      const json = await res.json().catch(() => null);
      const text = extractTranscriptFromResponseJson(json);
      if (text) {
        return {
          ok: true,
          text,
          source: 'meta-models/Muse-Spark-Open-816B-A42B:modal_audio',
          data: json
        };
      }
    }
  } catch (err) {
    console.warn('[MediaProcessor] Modal Muse Spark Open audio error:', err.message);
  }
  return null;
}

/**
 * Helper: Call Google Gemini Multimodal Audio across Gemini endpoints/models.
 * Uses candidate model cascade (gemini-3.8-flash -> gemini-3.6-flash -> gemini-2.5-flash -> gemini-3-flash-preview -> gemini-3.5-flash-lite)
 * with multi-key rotation and failover.
 */
export async function callGeminiAudioTranscribe({
  base64,
  rawMime = 'audio/wav',
  preferredModel = 'gemini-3.8-flash',
  timeoutMs = 25000
} = {}) {
  const geminiKeys = getGeminiApiKeys();
  if (!geminiKeys.length || !base64) return null;

  const geminiBaseUrl = (
    process.env.GEMINI_API_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/$/, '');

  const candidateModels = [
    preferredModel,
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.5-flash-lite'
  ].filter((m) => m && /gemini/i.test(m));
  const uniqueModels = [...new Set(candidateModels)];

  for (const geminiKey of geminiKeys) {
    for (const gModel of uniqueModels) {
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
            signal: AbortSignal.timeout(timeoutMs)
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
        } else if (res.status === 429 || res.status === 403 || res.status === 400) {
          // Key rate-limited or invalid, try next key
          break;
        }
      } catch (err) {
        // Continue to next candidate model
      }
    }
  }
  return null;
}

/**
 * Transcribe an audio chunk routed by the selected model category:
 * - When Gemini is selected: Route to Gemini Multimodal Audio FIRST, fallback to Meta / Whisper.
 * - When Meta is selected: Route to Meta Muse Voice Transcribe FIRST, fallback to Whisper / Gemini.
 * - When OpenAI is selected: Route to Whisper FIRST.
 */
export async function transcribeSingleAudioChunk(audioPayload, options = {}) {
  const rawMime = (audioPayload.mimeType || 'audio/wav').split(';')[0].trim();
  const defaultExt = rawMime.includes('wav') ? 'wav' : rawMime.includes('mp3') ? 'mp3' : 'webm';
  const filename = audioPayload.filename || `audio.${defaultExt}`;
  const preferredModel = options.preferredModel || audioPayload.preferredModel || '';
  const isGeminiCategory = /gemini/i.test(preferredModel);
  const isOpenAiCategory = /whisper|openai|gpt/i.test(preferredModel);
  const isMetaCategory = /muse|meta|spark|modal/i.test(preferredModel) || (!isGeminiCategory && !isOpenAiCategory);

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

  // 1. If Gemini is selected: Route directly to Gemini Multimodal Audio FIRST
  if (isGeminiCategory && base64) {
    const geminiPrimary = await callGeminiAudioTranscribe({
      base64,
      rawMime,
      preferredModel,
      timeoutMs: 25000
    });
    if (geminiPrimary && geminiPrimary.ok && geminiPrimary.text) {
      return geminiPrimary;
    }
  }

  // 2. If Meta is selected:
  // Primary: Selected Meta model itself (e.g. Modal Muse Spark Open or Meta Muse Wonder via input_audio)
  // Fallback: muse-voice-transcribe-1.0 dedicated endpoint if the selected model fails or cannot process it
  if (isMetaCategory) {
    // A. If Muse Spark Open or Modal is preferred, invoke the model directly first
    if (base64 && (/open|modal|816b/i.test(preferredModel) || !preferredModel || preferredModel === 'muse-spark-open')) {
      const modalRes = await callModalMuseSparkAudio({
        base64,
        rawMime,
        timeoutMs: 25000
      });
      if (modalRes && modalRes.ok && modalRes.text) {
        return modalRes;
      }
    }

    // B. Fallback to muse-voice-transcribe-1.0 across Meta / Fireworks / Llama endpoints
    const museVoiceRes = await callMetaMuseVoiceTranscribe({
      blob,
      base64,
      rawMime,
      defaultExt,
      filename,
      options,
      timeoutMs: 25000,
      isFinalFallback: false
    });
    if (museVoiceRes && museVoiceRes.ok && museVoiceRes.text) {
      return museVoiceRes;
    }

    // C. Additional sister Meta models fallback (Modal if not tried above)
    if (base64 && !/open|modal|816b/i.test(preferredModel)) {
      const modalFallback = await callModalMuseSparkAudio({
        base64,
        rawMime,
        timeoutMs: 25000
      });
      if (modalFallback && modalFallback.ok && modalFallback.text) {
        return modalFallback;
      }
    }

    // D. Final Meta family fallback across all Meta provider endpoints (never switch to non-Meta when Meta is selected)
    const finalMetaRes = await callMetaMuseVoiceTranscribe({
      blob,
      base64,
      rawMime,
      defaultExt,
      filename,
      options,
      timeoutMs: 30000,
      isFinalFallback: true
    });
    if (finalMetaRes && finalMetaRes.ok && finalMetaRes.text) {
      return finalMetaRes;
    }

    return {
      ok: true,
      text: options.mockText || '',
      source: 'muse-voice-transcribe-1.0:offline_fallback',
      modelFamily: 'meta'
    };
  }

  // 3. If OpenAI is selected: Route directly to OpenAI Whisper FIRST
  if (isOpenAiCategory) {
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
        console.warn('[MediaProcessor] Whisper error:', err.message);
      }
    }
  }

  // 4. Non-Meta Fallback: Meta Muse Voice Transcribe (if not already tried)
  if (!isMetaCategory) {
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
  }

  // 5. Intermediate Fallback: OpenAI Whisper (if not already tried and not Meta category)
  if (!isOpenAiCategory && !isMetaCategory) {
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
  }

  // 6. Intermediate Fallback: Gemini Multimodal Audio (if not already tried and not Meta category)
  if (!isGeminiCategory && !isMetaCategory && base64) {
    const geminiFallback = await callGeminiAudioTranscribe({
      base64,
      rawMime,
      preferredModel: 'gemini-3.8-flash',
      timeoutMs: 25000
    });
    if (geminiFallback && geminiFallback.ok && geminiFallback.text) {
      return geminiFallback;
    }
  }

  // 7. Final Handover Fallback: Meta Muse Voice Transcribe
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
 * Determine whether a model ID belongs to the Meta model family.
 */
export function isMetaFamilyModel(model = '') {
  const m = String(model || '').trim().toLowerCase();
  if (!m) return true; // Default model in Omni is muse-spark-open (Meta family)
  if (/gemini|gpt-|o1|o3|o4|claude-|sonnet-|opus-|haiku-|deepseek|kimi|moonshot/i.test(m)) {
    return false;
  }
  return /muse|meta|spark|llama|sam-|modal|fable|sol|terra/i.test(m);
}

/**
 * Return ordered candidate models & provider endpoints within the SAME model family.
 * When a Meta model is selected, every candidate belongs to the Meta model family
 * across its serving endpoints (Modal vLLM, Meta AI, Llama API, Fireworks, Together).
 */
export function getSameFamilyModelCandidates(selectedModel = 'muse-spark-open') {
  const req = String(selectedModel || 'muse-spark-open').trim();
  if (isMetaFamilyModel(req)) {
    const models = Array.from(
      new Set([
        req,
        req.toLowerCase() === 'muse-spark-open' ? 'meta-models/Muse-Spark-Open-816B-A42B' : req,
        'muse-spark-open',
        'meta-models/Muse-Spark-Open-816B-A42B',
        'muse-wonder-1.0',
        'muse-spark-1.3',
        'muse-spark-1.2',
        'muse-spark-1.1'
      ])
    );
    const endpoints = Array.from(
      new Set(
        [
          process.env.MODAL_MUSE_SPARK_URL || 'https://edelobi--ep-muse-spark-open-816b-a42b-server.us-west.modal.direct/v1',
          process.env.MODEL_API_BASE_URL,
          process.env.META_MUSE_BASE_URL,
          'https://api.meta.ai/v1',
          'https://api.llama.com/v1',
          'https://api.fireworks.ai/inference/v1',
          'https://api.together.xyz/v1'
        ].filter(Boolean)
      )
    );
    return { family: 'meta', selectedModel: req, models, endpoints };
  }
  if (/gemini/i.test(req)) {
    return {
      family: 'gemini',
      selectedModel: req,
      models: Array.from(new Set([req, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'])),
      endpoints: [process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta']
    };
  }
  if (/claude|sonnet|opus|haiku/i.test(req)) {
    return {
      family: 'anthropic',
      selectedModel: req,
      models: Array.from(new Set([req, 'claude-3-5-sonnet-20241022'])),
      endpoints: [process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1']
    };
  }
  return {
    family: 'openai',
    selectedModel: req,
    models: Array.from(new Set([req, 'gpt-4o'])),
    endpoints: [process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1']
  };
}

/**
 * Convert a media buffer into the wire payload format expected by the selected model's provider.
 */
export function formatMediaForSelectedModel({ buffer, mimeType, filename, selectedModel = 'muse-spark-open' } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const base64 = buf.toString('base64');
  const cleanMime = String(mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const { family, models, endpoints } = getSameFamilyModelCandidates(selectedModel);

  if (family === 'gemini') {
    return {
      family,
      selectedModel,
      candidateModels: models,
      candidateEndpoints: endpoints,
      providerFormat: 'gemini_inline_data',
      part: { inlineData: { mimeType: cleanMime, data: base64 } }
    };
  }

  if (family === 'anthropic') {
    return {
      family,
      selectedModel,
      candidateModels: models,
      candidateEndpoints: endpoints,
      providerFormat: 'anthropic_base64_source',
      part: {
        type: cleanMime.startsWith('image/') ? 'image' : 'document',
        source: { type: 'base64', media_type: cleanMime, data: base64 }
      }
    };
  }

  // Meta / OpenAI compatible multimodal format
  if (cleanMime.startsWith('image/')) {
    const validation = validateImageMetadata({ size: buf.length, mimeType: cleanMime, name: filename });
    const targetMime = validation.targetMime || cleanMime || 'image/png';
    return {
      family,
      selectedModel,
      candidateModels: models,
      candidateEndpoints: endpoints,
      providerFormat: 'openai_image_url',
      part: {
        type: 'image_url',
        image_url: { url: `data:${targetMime};base64,${base64}` }
      },
      inlinePart: { inlineData: { mimeType: targetMime, data: base64 } }
    };
  }

  if (cleanMime.startsWith('audio/')) {
    const format = cleanMime.includes('wav') ? 'wav' : cleanMime.includes('mp3') ? 'mp3' : 'wav';
    return {
      family,
      selectedModel,
      candidateModels: models,
      candidateEndpoints: endpoints,
      providerFormat: 'openai_input_audio',
      part: {
        type: 'input_audio',
        input_audio: { data: base64, format }
      },
      inlinePart: { inlineData: { mimeType: cleanMime, data: base64 } }
    };
  }

  return {
    family,
    selectedModel,
    candidateModels: models,
    candidateEndpoints: endpoints,
    providerFormat: 'openai_input_file',
    part: {
      type: 'file',
      file: { filename: filename || 'document.pdf', file_data: `data:${cleanMime};base64,${base64}` }
    },
    inlinePart: { inlineData: { mimeType: cleanMime, data: base64 } }
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
    const providerLabel = /gemini/i.test(options.preferredModel || '')
      ? 'Gemini'
      : /whisper|openai/i.test(options.preferredModel || '')
      ? 'Whisper'
      : 'muse-voice-transcribe-1.0';
    onProgress({
      currentSegment: i + 1,
      totalSegments: segments.length,
      status: `Transcribing segment ${i + 1} of ${segments.length} with ${providerLabel}...`
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
