/**
 * model-adapter.js
 *
 * Dedicated Meta Muse Model Adapter for Dotta.
 * Exclusively interfaces with Meta Muse models (Muse Spark Open, Muse Wonder,
 * Muse Spark versions) served via Meta's Chat Completions
 * API and partner inference endpoints (Modal serverless vLLM).
 */

import {
  consolidateMessageParts,
  normalizeThreadContents
} from './content-protocol.js';
import {
  toStandardChatMessages,
  toStandardChatTools,
  resolveMuseWireModel
} from './muse-provider.js';
import { getApiKey } from '../env.js';

export class ModelAdapter {
  constructor(providerName = 'meta') {
    this.providerName = providerName;
  }

  isConfigured() {
    return false;
  }

  async streamTurn(options) {
    throw new Error('streamTurn must be implemented by adapter subclass');
  }
}

export class MetaModelAdapter extends ModelAdapter {
  constructor({
    apiKeyGetter,
    baseUrlGetter,
    defaultModel = 'meta-models/Muse-Spark-Open-816B-A42B',
    modelResolver = (m) => m,
    authHeader = (key) => ({ Authorization: `Bearer ${key}` })
  } = {}) {
    super('meta');
    this.apiKeyGetter =
      typeof apiKeyGetter === 'function'
        ? apiKeyGetter
        : () =>
            process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET
              ? `${process.env.MODAL_PROXY_TOKEN_ID}.${process.env.MODAL_PROXY_TOKEN_SECRET}`
              : process.env.MODAL_API_KEY || getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY');
    this.baseUrlGetter =
      typeof baseUrlGetter === 'function'
        ? baseUrlGetter
        : () => process.env.MODAL_MUSE_SPARK_URL || '';
    this.defaultModel = defaultModel;
    this.modelResolver =
      typeof modelResolver === 'function'
        ? modelResolver
        : (m) =>
            m && m.toLowerCase() === 'muse-spark-open'
              ? 'meta-models/Muse-Spark-Open-816B-A42B'
              : m && m.toLowerCase().startsWith('muse-')
                ? m
                : process.env.META_MUSE_MODEL || 'meta-models/Muse-Spark-Open-816B-A42B';
    this.authHeader = authHeader;
  }

  isConfigured() {
    const key = typeof this.apiKeyGetter === 'function' ? this.apiKeyGetter() : null;
    return Boolean(key && key !== 'none');
  }

  async streamTurn({
    contents,
    systemInstruction,
    model = this.defaultModel,
    tools,
    generationConfig = {},
    callbacks = {}
  }) {
    const key = this.apiKeyGetter();
    if (!key || key === 'none') {
      throw new Error(
        `[MetaModelAdapter] Meta Muse model provider is not configured. Please ensure MODAL_API_KEY, MODAL_PROXY_TOKEN, or META_MUSE_API_KEY is configured in your environment.`
      );
    }

    const baseUrl = String(this.baseUrlGetter()).replace(/\/+$/, '');
    const wireModel = this.modelResolver(model) || this.defaultModel;
    const messages = toStandardChatMessages(contents, systemInstruction);
    const standardTools = toStandardChatTools(tools);

    const payload = {
      model: wireModel,
      messages,
      stream: true,
      ...(standardTools && standardTools.length > 0 ? { tools: standardTools } : {}),
      ...(generationConfig.maxOutputTokens ? { max_tokens: generationConfig.maxOutputTokens } : {}),
      ...(generationConfig.temperature !== undefined ? { temperature: generationConfig.temperature } : {})
    };

    const headers = {
      'Content-Type': 'application/json',
      ...this.authHeader(key)
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeout);
      throw new Error(`[MetaModelAdapter] Connection error to Meta inference endpoint (${baseUrl}): ${e.message}`);
    }

    if (!res.ok) {
      clearTimeout(timeout);
      const errText = await res.text().catch(() => '');
      throw new Error(`[MetaModelAdapter] Inference error HTTP ${res.status}: ${errText}`);
    }

    let fullThought = '';
    let fullText = '';
    const toolAcc = new Map();
    let usage = null;
    let isInsideThink = false;

    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          let json;
          try {
            json = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (json.usage) usage = json.usage;

          const choice = json.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta;
          if (!delta) continue;

          if (delta.reasoning_content) {
            fullThought += delta.reasoning_content;
            callbacks.onThoughtChunk?.(delta.reasoning_content);
          }

          if (delta.content) {
            let textChunk = delta.content;
            while (textChunk.length > 0) {
              if (!isInsideThink) {
                const startIdx = textChunk.indexOf('<think>');
                if (startIdx !== -1) {
                  const visiblePart = textChunk.slice(0, startIdx);
                  if (visiblePart) {
                    fullText += visiblePart;
                    callbacks.onResponseChunk?.(visiblePart);
                  }
                  isInsideThink = true;
                  textChunk = textChunk.slice(startIdx + 7);
                } else {
                  fullText += textChunk;
                  callbacks.onResponseChunk?.(textChunk);
                  break;
                }
              } else {
                const endIdx = textChunk.indexOf('</think>');
                if (endIdx !== -1) {
                  const thoughtPart = textChunk.slice(0, endIdx);
                  if (thoughtPart) {
                    fullThought += thoughtPart;
                    callbacks.onThoughtChunk?.(thoughtPart);
                  }
                  isInsideThink = false;
                  textChunk = textChunk.slice(endIdx + 8);
                } else {
                  fullThought += textChunk;
                  callbacks.onThoughtChunk?.(textChunk);
                  break;
                }
              }
            }
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const acc = toolAcc.get(idx) || { id: '', name: '', args: '' };
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name += tc.function.name;
              if (tc.function?.arguments) acc.args += tc.function.arguments;
              toolAcc.set(idx, acc);
            }
          }
        }
      }
    } catch (e) {
      throw new Error(`[MetaModelAdapter] Stream error: ${e.message}`);
    } finally {
      clearTimeout(timeout);
    }

    const thinkMatch = fullText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      if (!fullThought) {
        fullThought = thinkMatch[1].trim();
        callbacks.onThoughtChunk?.(fullThought);
      }
      fullText = fullText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    }

    const functionCalls = [];
    const modelParts = [];
    if (fullThought) modelParts.push({ text: fullThought, thought: true });
    if (fullText) modelParts.push({ text: fullText });

    for (const [, acc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
      if (!acc.name) continue;
      let args = {};
      try {
        args = acc.args ? JSON.parse(acc.args) : {};
      } catch {
        args = {};
      }
      const fc = { name: acc.name, args, ...(acc.id ? { id: acc.id } : {}) };
      functionCalls.push(fc);
      modelParts.push({ functionCall: fc });
      callbacks.onFunctionCall?.(fc);
    }

    if (!fullText && !fullThought && functionCalls.length === 0) {
      throw new Error(`[MetaModelAdapter] (${wireModel}) returned an empty response.`);
    }

    return {
      provider: 'meta',
      model: wireModel,
      thought: fullThought,
      text: fullText,
      functionCalls,
      modelParts,
      usageMetadata: usage
        ? {
            promptTokenCount: usage.prompt_tokens || 0,
            candidatesTokenCount: usage.completion_tokens || 0,
            totalTokenCount: usage.total_tokens || 0
          }
        : null
    };
  }
}

let sharedMetaAdapter = null;

export function getModelAdapter(providerName = 'meta') {
  if (!sharedMetaAdapter) {
    sharedMetaAdapter = new MetaModelAdapter({
      apiKeyGetter: () =>
        process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET
          ? `${process.env.MODAL_PROXY_TOKEN_ID}.${process.env.MODAL_PROXY_TOKEN_SECRET}`
          : process.env.MODAL_API_KEY || getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY'),
      baseUrlGetter: () => process.env.MODAL_MUSE_SPARK_URL || '',
      defaultModel: 'meta-models/Muse-Spark-Open-816B-A42B',
      modelResolver: (m) =>
        m && m.toLowerCase() === 'muse-spark-open'
          ? 'meta-models/Muse-Spark-Open-816B-A42B'
          : m && m.toLowerCase().startsWith('muse-')
            ? m
            : process.env.META_MUSE_MODEL || 'meta-models/Muse-Spark-Open-816B-A42B',
      authHeader: (key) => {
        const headers = { Authorization: `Bearer ${key}` };
        if (process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET) {
          headers['Modal-Key'] = process.env.MODAL_PROXY_TOKEN_ID;
          headers['Modal-Secret'] = process.env.MODAL_PROXY_TOKEN_SECRET;
        }
        return headers;
      }
    });
  }
  return sharedMetaAdapter;
}

export function resolveProviderForModel(modelId = '') {
  const m = String(modelId || '').trim().toLowerCase();
  if (m === 'muse-glimmer' || m.includes('glimmer') || m.startsWith('meta/muse-glimmer')) {
    return 'nvidia';
  }
  if (
    !m ||
    m.startsWith('meta-') ||
    m.startsWith('muse-') ||
    m.startsWith('sam-') ||
    m.includes('spark') ||
    m.includes('wonder')
  ) {
    return 'meta';
  }
  return 'meta';
}

export async function streamModelTurn({
  contents,
  systemInstruction = '',
  model = process.env.DEFAULT_MODEL || 'muse-spark-open',
  tools = null,
  generationConfig = {},
  callbacks = {},
  userCredentials = null
}) {
  const provider = resolveProviderForModel(model);

  // If user-funded credentials are provided for this run, construct an ephemeral,
  // user-scoped adapter that does not leak or persist across turns/users.
  let adapter;
  const isGlimmer = model === 'muse-glimmer' || String(model).includes('glimmer') || String(model).startsWith('meta/muse-glimmer');

  if (userCredentials && (userCredentials.nvidiaKey || userCredentials.nvidia?.apiKey) && isGlimmer) {
    const nvidiaKey = userCredentials.nvidiaKey || userCredentials.nvidia?.apiKey;
    adapter = new MetaModelAdapter({
      apiKeyGetter: () => nvidiaKey,
      baseUrlGetter: () => 'https://integrate.api.nvidia.com/v1',
      defaultModel: 'meta/muse-glimmer-30b',
      modelResolver: () => 'meta/muse-glimmer-30b',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` })
    });
  } else if (userCredentials && (userCredentials.metaKey || userCredentials.modal?.tokenId || userCredentials.modal?.apiKey)) {
    const isModalRun =
      Boolean(userCredentials.modal?.endpointUrl && (userCredentials.modal?.tokenId || userCredentials.modal?.apiKey)) &&
      (model === 'muse-spark-open' || String(model).includes('open'));

    if (isModalRun) {
      const modalCfg = userCredentials.modal;
      const modalKey = modalCfg.tokenId && modalCfg.tokenSecret
        ? `${modalCfg.tokenId}.${modalCfg.tokenSecret}`
        : modalCfg.apiKey || modalCfg.tokenId;

      adapter = new MetaModelAdapter({
        apiKeyGetter: () => modalKey,
        baseUrlGetter: () => modalCfg.endpointUrl,
        defaultModel: 'meta-models/Muse-Spark-Open-816B-A42B',
        modelResolver: () => 'meta-models/Muse-Spark-Open-816B-A42B',
        authHeader: (k) => {
          const h = { Authorization: `Bearer ${k}` };
          if (modalCfg.tokenId) h['Modal-Key'] = modalCfg.tokenId;
          if (modalCfg.tokenSecret) h['Modal-Secret'] = modalCfg.tokenSecret;
          return h;
        }
      });
    } else {
      const metaKey = userCredentials.metaKey || userCredentials.apiKey;
      adapter = new MetaModelAdapter({
        apiKeyGetter: () => metaKey,
        baseUrlGetter: () =>
          (process.env.META_MUSE_BASE_URL || process.env.MODEL_API_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, ''),
        defaultModel: 'muse-spark-open',
        modelResolver: (m) => resolveMuseWireModel(m),
        authHeader: (k) => ({ Authorization: `Bearer ${k}` })
      });
    }
  } else if (isGlimmer && process.env.NVIDIA_API_KEY) {
    adapter = new MetaModelAdapter({
      apiKeyGetter: () => process.env.NVIDIA_API_KEY,
      baseUrlGetter: () => 'https://integrate.api.nvidia.com/v1',
      defaultModel: 'meta/muse-glimmer-30b',
      modelResolver: () => 'meta/muse-glimmer-30b',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` })
    });
  } else {
    // Fallback adapter for tests or operator mode
    adapter = getModelAdapter(provider);
  }

  if (!adapter.isConfigured()) {
    throw new Error(
      `[ModelAdapter] Meta Muse model provider is not configured. Please ensure your Meta API key is configured in Settings -> API Keys.`
    );
  }

  return await adapter.streamTurn({
    contents,
    systemInstruction,
    model,
    tools,
    generationConfig,
    callbacks
  });
}
