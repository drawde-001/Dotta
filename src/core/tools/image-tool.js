/**
 * image-tool.js
 *
 * Implements generate_image and edit_image tools backed strictly by Meta's
 * muse-image-1.0 model on the Meta API (/v1/images/generations and /v1/responses).
 *
 * Stores generated binary images in memory + tmpdir and serves them via
 * /api/images/:filename so the UI ImageGeneration / Image components render
 * crisp images without bloating LLM conversation history with base64 strings.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getApiKey, getGeminiApiKeys } from '../env.js';

export const PRIMARY_IMAGE_MODEL = 'muse-image-1.0';

const generatedImageStore = new Map();
const IMAGE_CACHE_DIR = path.join(os.tmpdir(), 'dotta-generated-images');

function ensureCacheDir() {
  try {
    if (!fs.existsSync(IMAGE_CACHE_DIR)) {
      fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
    }
  } catch {}
}

function detectMimeAndExt(b64) {
  const head = String(b64 || '').slice(0, 16);
  if (head.startsWith('UklGR')) return { mimeType: 'image/webp', ext: 'webp' };
  if (head.startsWith('/9j/')) return { mimeType: 'image/jpeg', ext: 'jpg' };
  if (head.startsWith('R0lGOD')) return { mimeType: 'image/gif', ext: 'gif' };
  return { mimeType: 'image/png', ext: 'png' };
}

export function storeGeneratedImage(b64Data, prompt = '') {
  const cleanB64 = String(b64Data || '').replace(/^data:[^;]+;base64,/, '');
  const { mimeType, ext } = detectMimeAndExt(cleanB64);
  const buffer = Buffer.from(cleanB64, 'base64');
  const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${id}.${ext}`;

  generatedImageStore.set(filename, {
    buffer,
    mimeType,
    prompt,
    createdAt: Date.now()
  });

  // Bound in-memory cache to 50 recent images
  if (generatedImageStore.size > 50) {
    const oldestKey = generatedImageStore.keys().next().value;
    if (oldestKey) generatedImageStore.delete(oldestKey);
  }

  ensureCacheDir();
  try {
    fs.writeFileSync(path.join(IMAGE_CACHE_DIR, filename), buffer);
  } catch {}

  return {
    id,
    filename,
    mimeType,
    byteLength: buffer.length,
    url: `/api/images/${filename}`
  };
}

export function getGeneratedImage(filename) {
  const safeName = path.basename(String(filename || ''));
  if (!safeName) return null;

  if (generatedImageStore.has(safeName)) {
    return generatedImageStore.get(safeName);
  }

  const diskPath = path.join(IMAGE_CACHE_DIR, safeName);
  if (fs.existsSync(diskPath)) {
    try {
      const buffer = fs.readFileSync(diskPath);
      const ext = path.extname(safeName).toLowerCase();
      const mimeType =
        ext === '.webp'
          ? 'image/webp'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/png';
      return { buffer, mimeType };
    } catch {}
  }
  return null;
}

/**
 * Executes image generation via Meta muse-image-1.0.
 */
export async function executeGenerateImage(args = {}, options = {}) {
  const prompt = String(args.prompt || args.description || args.query || '').trim();
  const size = String(args.size || '1024x1024').trim();

  if (!prompt) {
    return {
      status: 'permanent_error',
      model: PRIMARY_IMAGE_MODEL,
      message: 'Missing required parameter: prompt.'
    };
  }

  if (options.mockFetch || typeof args._mockB64 === 'string') {
    const stored = storeGeneratedImage(
      args._mockB64 || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      prompt
    );
    return {
      status: 'ok',
      model: PRIMARY_IMAGE_MODEL,
      prompt,
      size,
      url: stored.url,
      imageUrl: stored.url,
      filename: stored.filename,
      mimeType: stored.mimeType,
      note: 'Image generated and rendered in the UI via the ImageGeneration component. Keep your text response brief and do NOT output markdown image tags or base64.'
    };
  }

  const fetchFn = options.fetchFn || globalThis.fetch;
  const isGeminiCategory = options.activeModel && /gemini/i.test(options.activeModel);

  // When Gemini is selected: Route to Google Imagen 3 first
  if (isGeminiCategory) {
    const geminiKeys = getGeminiApiKeys();
    const geminiBase = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    for (const gKey of geminiKeys) {
      try {
        const imagenRes = await fetchFn(`${geminiBase}/models/imagen-3.0-generate-002:predict?key=${gKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: size.includes('16:9') ? '16:9' : '1:1' }
          }),
          signal: AbortSignal.timeout(35000)
        });
        if (imagenRes.ok) {
          const imgData = await imagenRes.json();
          const b64 = imgData?.predictions?.[0]?.bytesBase64Encoded;
          if (b64) {
            const stored = storeGeneratedImage(b64, prompt);
            return {
              status: 'ok',
              model: 'imagen-3.0-generate-002',
              prompt,
              size,
              url: stored.url,
              imageUrl: stored.url,
              filename: stored.filename,
              mimeType: stored.mimeType,
              note: 'Image generated via Google Imagen 3 and rendered in the UI via the ImageGeneration component. Keep your text response brief and do NOT output markdown image tags or base64.'
            };
          }
        }
      } catch (err) {
        console.warn('[ImageTool] Imagen 3 generation attempt failed, falling back to Muse Image:', err.message);
      }
    }
  }

  // Meta Muse Image 1.0 (PRIMARY for Meta models, fallback for Gemini/others)
  const apiKey =
    options.apiKey ||
    getApiKey('MODEL_API_KEY') ||
    getApiKey('META_MUSE_API_KEY') ||
    getApiKey('MUSE_API_KEY');

  if (!apiKey) {
    return {
      status: 'permanent_error',
      model: PRIMARY_IMAGE_MODEL,
      message: 'Image generation key (MODEL_API_KEY / META_MUSE_API_KEY / GEMINI_API_KEY) is not configured on the server.'
    };
  }

  const baseUrl = (
    options.baseUrl ||
    process.env.MODEL_API_BASE_URL ||
    process.env.META_MUSE_BASE_URL ||
    process.env.MUSE_BASE_URL ||
    'https://api.meta.ai/v1'
  ).replace(/\/+$/, '');

  // 1. Primary Meta Image Generation Endpoint: POST {baseUrl}/images/generations
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const response = await fetchFn(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: PRIMARY_IMAGE_MODEL,
        prompt,
        size
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const first = Array.isArray(data?.data) ? data.data[0] : data;
      const b64 = first?.b64_json || first?.base64 || data?.b64_json;
      const remoteUrl = first?.url || first?.image_url || data?.url;

      if (b64) {
        const stored = storeGeneratedImage(b64, prompt);
        return {
          status: 'ok',
          model: PRIMARY_IMAGE_MODEL,
          prompt,
          revisedPrompt: first?.revised_prompt || prompt,
          size,
          url: stored.url,
          imageUrl: stored.url,
          filename: stored.filename,
          mimeType: stored.mimeType,
          note: 'Image generated and rendered in the UI via the ImageGeneration component. Keep your text response brief and do NOT output markdown image tags or base64.'
        };
      }

      if (remoteUrl) {
        return {
          status: 'ok',
          model: PRIMARY_IMAGE_MODEL,
          prompt,
          revisedPrompt: first?.revised_prompt || prompt,
          size,
          url: remoteUrl,
          imageUrl: remoteUrl,
          note: 'Image generated and rendered in the UI via the ImageGeneration component. Keep your text response brief and do NOT output markdown image tags.'
        };
      }
    } else {
      const errText = await response.text().catch(() => '');
      console.warn(`[ImageTool] /images/generations returned HTTP ${response.status}: ${errText.slice(0, 300)}`);
    }
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[ImageTool] /images/generations error: ${err.message}`);
  }

  // 2. Fallback Meta Responses Endpoint: POST {baseUrl}/responses with muse-image-1.0
  const fallbackController = new AbortController();
  const fallbackTimeout = setTimeout(() => fallbackController.abort(), 55000);

  try {
    const response = await fetchFn(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: PRIMARY_IMAGE_MODEL,
        input: prompt
      }),
      signal: fallbackController.signal
    });
    clearTimeout(fallbackTimeout);

    if (response.ok) {
      const data = await response.json();
      const outputs = Array.isArray(data?.output) ? data.output : [];
      for (const item of outputs) {
        const b64 = item?.result || item?.b64_json || item?.image?.b64_json;
        if (typeof b64 === 'string' && b64.length > 64) {
          const stored = storeGeneratedImage(b64, prompt);
          return {
            status: 'ok',
            model: PRIMARY_IMAGE_MODEL,
            prompt,
            size,
            url: stored.url,
            imageUrl: stored.url,
            filename: stored.filename,
            mimeType: stored.mimeType,
            note: 'Image generated and rendered in the UI via the ImageGeneration component. Keep your text response brief and do NOT output markdown image tags or base64.'
          };
        }
      }
    }
  } catch (err) {
    clearTimeout(fallbackTimeout);
    console.warn(`[ImageTool] /responses fallback error: ${err.message}`);
  }

  return {
    status: 'retryable_error',
    model: PRIMARY_IMAGE_MODEL,
    prompt,
    message: `Meta ${PRIMARY_IMAGE_MODEL} could not generate the image at this time.`
  };
}
