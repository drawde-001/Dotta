import {
  consolidateGeminiParts,
  normalizeGeminiContents,
  toGeminiFunctionDeclarations
} from './gemini-protocol.js';
import {
  toOpenAiMessages,
  toOpenAiTools
} from './muse-provider.js';
import { getApiKey } from '../env.js';

export const GEMINI_MODEL_CATALOG = {
  'gemini-3.8-flash': { status: 'stable', isCurrent: true, contextWindow: 1048576, defaultThinking: 'medium', defaultThinkingBudget: 2048, defaultMaxOutputTokens: 8192 },
  'gemini-3.6-flash': { status: 'stable', isCurrent: true, contextWindow: 1048576, defaultThinking: 'medium', defaultThinkingBudget: 2048, defaultMaxOutputTokens: 8192 },
  'gemini-3.5-flash-lite': { status: 'stable', isCurrent: true, contextWindow: 1048576, defaultThinking: 'minimal', defaultThinkingBudget: 1024, defaultMaxOutputTokens: 8192 },
  'gemini-3.1-flash-lite': { status: 'stable', isCurrent: true, contextWindow: 1048576, defaultThinking: 'minimal', defaultThinkingBudget: 1024, defaultMaxOutputTokens: 8192 },
  'gemini-4-argon': { status: 'stable', isCurrent: true, contextWindow: 1048576, defaultThinking: 'medium', defaultThinkingBudget: 2048, defaultMaxOutputTokens: 8192 },
  'gemini-3-flash-preview': { status: 'preview', isCurrent: true, contextWindow: 1048576, defaultThinking: 'high', defaultThinkingBudget: 4096, defaultMaxOutputTokens: 12288 },
  'gemini-3.1-pro-preview': { status: 'preview', isCurrent: true, contextWindow: 1048576, defaultThinking: 'high', defaultThinkingBudget: 4096, defaultMaxOutputTokens: 12288 },
  'gemini-2.5-flash': { status: 'legacy_access', isCurrent: true, contextWindow: 1048576, defaultThinking: 'on', defaultThinkingBudget: 2048, defaultMaxOutputTokens: 8192 },
  'gemini-2.5-pro': { status: 'legacy_access', isCurrent: true, contextWindow: 1048576, defaultThinking: 'on', defaultThinkingBudget: 4096, defaultMaxOutputTokens: 12288 },
  'gemini-2.0-flash': { status: 'shut_down', isCurrent: false, replacement: 'gemini-3.8-flash' },
  'gemini-2.0-flash-lite': { status: 'shut_down', isCurrent: false, replacement: 'gemini-3.5-flash-lite' },
  'gemini-3-pro-preview': { status: 'shut_down', isCurrent: false, replacement: 'gemini-3.1-pro-preview' },
  'gemini-3.1-flash-lite-preview': { status: 'shut_down', isCurrent: false, replacement: 'gemini-3.1-flash-lite' },
  'gemini-1.5-flash': { status: 'deprecated', isCurrent: false, replacement: 'gemini-3.8-flash' },
  'gemini-1.5-pro': { status: 'deprecated', isCurrent: false, replacement: 'gemini-3.1-pro-preview' }
};

export function resolveGeminiModelCandidates(requestedModel = 'gemini-3.8-flash') {
  const req = String(requestedModel || 'gemini-3.8-flash').trim();
  const entry = GEMINI_MODEL_CATALOG[req];

  if (!entry) {
    const validKeys = Object.entries(GEMINI_MODEL_CATALOG)
      .filter(([, v]) => v.isCurrent)
      .map(([k]) => k);
    throw new Error(
      `Invalid model ID "${req}". Valid models: ${validKeys.join(', ')}`
    );
  }

  if (entry.status === 'shut_down' || entry.status === 'deprecated') {
    const replacement = entry.replacement || 'gemini-3.8-flash';
    console.warn(
      `[ModelAdapter Warning] Model "${req}" is ${entry.status.toUpperCase()}. Auto-migrating to "${replacement}".`
    );
    return [replacement, 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'];
  }

  const targetModel = entry.aliasFor || req;
  const candidates = [targetModel];
  const defaults = ['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'];
  for (const def of defaults) {
    if (!candidates.includes(def)) candidates.push(def);
  }
  return candidates;
}

export function resolveGenerationConfig(model = 'gemini-3.8-flash', userGenConfig = {}, minHeadroom = 2048) {
  const entry = GEMINI_MODEL_CATALOG[model] || {};
  const defaultBudget = entry.defaultThinkingBudget || 2048;
  const defaultMaxOutput = entry.defaultMaxOutputTokens || 8192;

  const thinkingConfig = {
    includeThoughts: true,
    ...(userGenConfig.thinkingConfig || {})
  };

  if (thinkingConfig.thinkingBudget === undefined && thinkingConfig.thinkingLevel === undefined) {
    if (defaultBudget > 0) {
      thinkingConfig.thinkingBudget = defaultBudget;
    }
  }

  const thinkingBudget = typeof thinkingConfig.thinkingBudget === 'number' ? thinkingConfig.thinkingBudget : 0;
  let maxOutputTokens = typeof userGenConfig.maxOutputTokens === 'number'
    ? userGenConfig.maxOutputTokens
    : defaultMaxOutput;

  if (thinkingBudget > 0 && maxOutputTokens - thinkingBudget < minHeadroom) {
    maxOutputTokens = thinkingBudget + minHeadroom;
  }

  return {
    ...userGenConfig,
    maxOutputTokens,
    thinkingConfig
  };
}

export class ModelAdapter {
  constructor(providerName) {
    this.providerName = providerName;
  }

  isConfigured() {
    return false;
  }

  async streamTurn(options) {
    throw new Error('streamTurn must be implemented by adapter subclass');
  }
}

export class GeminiModelAdapter extends ModelAdapter {
  constructor(apiKeyGetter, baseUrlGetter) {
    super('gemini');
    this.apiKeyGetter = typeof apiKeyGetter === 'function' ? apiKeyGetter : () => getApiKey('GEMINI_API_KEY');
    this.baseUrlGetter = typeof baseUrlGetter === 'function' ? baseUrlGetter : () => process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  }

  isConfigured() {
    return Boolean(this.apiKeyGetter());
  }

  async streamTurn({
    contents,
    systemInstruction = '',
    model = 'gemini-3.8-flash',
    tools = null,
    generationConfig = {},
    callbacks = {}
  }) {
    const apiKey = this.apiKeyGetter();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured on server.');
    }

    const candidateModels = resolveGeminiModelCandidates(model);
    const normalizedContents = normalizeGeminiContents(contents);
    const baseUrl = this.baseUrlGetter();

    for (const candModel of candidateModels) {
      try {
        const url = `${baseUrl}/models/${candModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const payload = {
          contents: normalizedContents,
          generationConfig: resolveGenerationConfig(candModel, generationConfig)
        };

        if (systemInstruction) {
          payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        if (Array.isArray(tools) && tools.length > 0) {
          payload.tools = [{ functionDeclarations: toGeminiFunctionDeclarations(tools) }];
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[Gemini Adapter HTTP ${response.status} - ${candModel}]:`, errText);
          continue;
        }

        let fullThought = '';
        let fullText = '';
        const functionCalls = [];
        const rawModelParts = [];
        let usageMetadata = null;
        let buffer = '';

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6).trim();
              if (jsonStr === '[DONE]') continue;
              try {
                const data = JSON.parse(jsonStr);
                if (data.usageMetadata) {
                  usageMetadata = data.usageMetadata;
                }
                const parts = data.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                  rawModelParts.push(part);
                  if (part.thought && typeof part.text === 'string') {
                    fullThought += part.text;
                    if (callbacks.onThoughtChunk) callbacks.onThoughtChunk(part.text);
                  } else if (part.functionCall) {
                    functionCalls.push(part.functionCall);
                    if (callbacks.onFunctionCall) callbacks.onFunctionCall(part.functionCall);
                  } else if (typeof part.text === 'string' && part.text.length > 0) {
                    fullText += part.text;
                    if (callbacks.onResponseChunk) callbacks.onResponseChunk(part.text);
                  }
                }
              } catch (err) {}
            }
          }
        }

        const modelParts = consolidateGeminiParts(rawModelParts);

        if (fullText || fullThought || functionCalls.length > 0 || modelParts.length > 0) {
          return {
            provider: 'gemini',
            model: candModel,
            thought: fullThought,
            text: fullText,
            functionCalls,
            modelParts,
            usageMetadata
          };
        }
      } catch (e) {
        console.warn(`[Gemini Adapter Request Error - ${candModel}]:`, e.message);
      }
    }

    throw new Error(`Failed to generate content with candidate models: ${candidateModels.join(', ')}`);
  }
}

export class OpenAiCompatibleModelAdapter extends ModelAdapter {
  constructor({
    providerName,
    apiKeyGetter,
    baseUrlGetter,
    defaultModel = 'gpt-4o',
    modelResolver = (m) => m,
    authHeader = (key) => ({ Authorization: `Bearer ${key}` })
  }) {
    super(providerName);
    this.apiKeyGetter = typeof apiKeyGetter === 'function' ? apiKeyGetter : () => null;
    this.baseUrlGetter = typeof baseUrlGetter === 'function' ? baseUrlGetter : () => 'https://api.openai.com/v1';
    this.defaultModel = defaultModel;
    this.modelResolver = typeof modelResolver === 'function' ? modelResolver : (m) => m;
    this.authHeader = typeof authHeader === 'function' ? authHeader : (k) => ({ Authorization: `Bearer ${k}` });
  }

  isConfigured() {
    return Boolean(this.apiKeyGetter());
  }

  async streamTurn({
    contents,
    systemInstruction = '',
    model,
    tools = null,
    generationConfig = {},
    callbacks = {}
  }) {
    const apiKey = this.apiKeyGetter();
    if (!apiKey) {
      throw new Error(`[${this.providerName.toUpperCase()}] API key is not configured on server.`);
    }

    const wireModel = this.modelResolver(model) || this.defaultModel;
    const baseUrl = (this.baseUrlGetter() || '').replace(/\/+$/, '');
    const normalizedContents = normalizeGeminiContents(contents);

    const payload = {
      model: wireModel,
      messages: toOpenAiMessages(normalizedContents, systemInstruction),
      stream: true,
      stream_options: { include_usage: true }
    };

    const oaiTools = toOpenAiTools(tools);
    if (oaiTools) payload.tools = oaiTools;
    if (generationConfig?.maxOutputTokens) payload.max_tokens = generationConfig.maxOutputTokens;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeader(apiKey)
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`[${this.providerName}] Connection failed to ${baseUrl}: ${err.message}`);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const errBody = await response.text().catch(() => '');
      throw new Error(`[${this.providerName} HTTP ${response.status} - ${wireModel}]: ${errBody.slice(0, 600)}`);
    }

    let fullText = '';
    let fullThought = '';
    let isInsideThink = false;
    let usage = null;
    const toolAcc = new Map();

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          let data;
          try {
            data = JSON.parse(jsonStr);
          } catch {
            continue;
          }
          if (data.usage) usage = data.usage;
          const delta = data.choices?.[0]?.delta;
          if (!delta) continue;

          const reasoning =
            delta.reasoning_content ??
            delta.reasoning ??
            delta.thought ??
            delta.thinking ??
            delta.thought_content ??
            delta.reasoning_text ??
            data.choices?.[0]?.message?.reasoning ??
            data.choices?.[0]?.message?.thought ??
            data.choices?.[0]?.message?.reasoning_content;

          if (typeof reasoning === 'string' && reasoning) {
            fullThought += reasoning;
            callbacks.onThoughtChunk?.(reasoning);
          }

          if (typeof delta.content === 'string' && delta.content) {
            let textChunk = delta.content;
            while (textChunk.length > 0) {
              if (!isInsideThink) {
                const startIdx = textChunk.indexOf('<think>');
                if (startIdx !== -1) {
                  const pre = textChunk.slice(0, startIdx);
                  if (pre) {
                    fullText += pre;
                    callbacks.onResponseChunk?.(pre);
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
      throw new Error(`[${this.providerName}] Stream error: ${e.message}`);
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
      throw new Error(`[${this.providerName}] (${wireModel}) returned an empty response.`);
    }

    return {
      provider: this.providerName,
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

export class AnthropicModelAdapter extends ModelAdapter {
  constructor({
    apiKeyGetter,
    baseUrlGetter,
    defaultModel = 'claude-3-5-sonnet-20241022',
    modelResolver = (m) => m
  } = {}) {
    super('anthropic');
    this.apiKeyGetter = typeof apiKeyGetter === 'function' ? apiKeyGetter : () => getApiKey('ANTHROPIC_API_KEY');
    this.baseUrlGetter = typeof baseUrlGetter === 'function' ? baseUrlGetter : () => process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
    this.defaultModel = defaultModel;
    this.modelResolver = typeof modelResolver === 'function' ? modelResolver : (m) => m;
  }

  isConfigured() {
    return Boolean(this.apiKeyGetter());
  }

  async streamTurn({
    contents,
    systemInstruction = '',
    model,
    tools = null,
    generationConfig = {},
    callbacks = {}
  }) {
    const apiKey = this.apiKeyGetter();
    if (!apiKey) {
      throw new Error('[ANTHROPIC] ANTHROPIC_API_KEY is not configured on server.');
    }

    const wireModel = this.modelResolver(model) || this.defaultModel;
    const baseUrl = (this.baseUrlGetter() || '').replace(/\/+$/, '');
    const normalizedContents = normalizeGeminiContents(contents);

    const messages = [];
    let pendingToolUses = [];

    for (const item of normalizedContents) {
      const parts = Array.isArray(item.parts) ? item.parts : [];
      if (item.role === 'model' || item.role === 'assistant') {
        if (pendingToolUses.length > 0) {
          messages.push({
            role: 'user',
            content: pendingToolUses.map((tc) => ({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: JSON.stringify({ status: 'acknowledged', output: `Acknowledged ${tc.name || 'tool'}` })
            }))
          });
          pendingToolUses = [];
        }

        const content = [];
        for (const p of parts) {
          if (!p.thought && typeof p.text === 'string' && p.text) {
            content.push({ type: 'text', text: p.text });
          }
          if (p.functionCall) {
            const id = p.functionCall.id || `toolu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            pendingToolUses.push({ id, name: p.functionCall.name });
            content.push({
              type: 'tool_use',
              id,
              name: p.functionCall.name,
              input: p.functionCall.args || {}
            });
          }
        }
        if (content.length > 0) messages.push({ role: 'assistant', content });
        continue;
      }

      const content = [];
      for (const p of parts) {
        if (p.functionResponse) {
          const name = p.functionResponse.name;
          let matchedIdx = -1;
          if (p.functionResponse.id) {
            matchedIdx = pendingToolUses.findIndex((tc) => tc.id === p.functionResponse.id);
          }
          if (matchedIdx === -1 && name) {
            matchedIdx = pendingToolUses.findIndex((tc) => tc.name === name);
          }

          let id = p.functionResponse.id;
          if (matchedIdx !== -1) {
            id = pendingToolUses[matchedIdx].id;
            pendingToolUses.splice(matchedIdx, 1);
          } else if (!id) {
            id = `toolu_${Date.now().toString(36)}`;
          }

          content.push({
            type: 'tool_result',
            tool_use_id: id,
            content: typeof p.functionResponse.response === 'string'
              ? p.functionResponse.response
              : JSON.stringify(p.functionResponse.response ?? {})
          });
        }
      }

      while (pendingToolUses.length > 0) {
        const missing = pendingToolUses.shift();
        content.push({
          type: 'tool_result',
          tool_use_id: missing.id,
          content: JSON.stringify({ status: 'acknowledged', output: `Acknowledged ${missing.name || 'tool'}` })
        });
      }

      for (const p of parts) {
        if (!p.thought && typeof p.text === 'string' && p.text) {
          content.push({ type: 'text', text: p.text });
        }
      }
      if (content.length > 0) messages.push({ role: 'user', content });
    }

    if (pendingToolUses.length > 0) {
      messages.push({
        role: 'user',
        content: pendingToolUses.map((tc) => ({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: JSON.stringify({ status: 'acknowledged', output: `Acknowledged ${tc.name || 'tool'}` })
        }))
      });
      pendingToolUses = [];
    }

    const payload = {
      model: wireModel,
      max_tokens: generationConfig?.maxOutputTokens || 8192,
      messages,
      stream: true
    };

    if (systemInstruction) payload.system = systemInstruction;

    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools.map((t) => ({
        name: t.name,
        description: t.description || '',
        input_schema: t.parameters || { type: 'object', properties: {} }
      }));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`[anthropic] Connection failed to ${baseUrl}: ${err.message}`);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const errBody = await response.text().catch(() => '');
      throw new Error(`[anthropic HTTP ${response.status} - ${wireModel}]: ${errBody.slice(0, 600)}`);
    }

    let fullText = '';
    let fullThought = '';
    const toolBlocks = new Map();
    let usage = null;

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          let evt;
          try {
            evt = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (evt.type === 'message_start' && evt.message?.usage) {
            usage = evt.message.usage;
          } else if (evt.type === 'message_delta' && evt.usage) {
            usage = { ...(usage || {}), ...evt.usage };
          } else if (evt.type === 'content_block_start') {
            const idx = evt.index;
            if (evt.content_block?.type === 'tool_use') {
              toolBlocks.set(idx, {
                id: evt.content_block.id,
                name: evt.content_block.name,
                json: ''
              });
            }
          } else if (evt.type === 'content_block_delta') {
            const idx = evt.index;
            const delta = evt.delta;
            if (delta?.type === 'text_delta' && delta.text) {
              fullText += delta.text;
              callbacks.onResponseChunk?.(delta.text);
            } else if (delta?.type === 'thinking_delta' && delta.thinking) {
              fullThought += delta.thinking;
              callbacks.onThoughtChunk?.(delta.thinking);
            } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
              const blk = toolBlocks.get(idx);
              if (blk) blk.json += delta.partial_json;
            }
          }
        }
      }
    } catch (e) {
      throw new Error(`[anthropic] Stream error: ${e.message}`);
    } finally {
      clearTimeout(timeout);
    }

    const functionCalls = [];
    const modelParts = [];
    if (fullThought) modelParts.push({ text: fullThought, thought: true });
    if (fullText) modelParts.push({ text: fullText });

    for (const [, blk] of toolBlocks.entries()) {
      let args = {};
      try {
        args = blk.json ? JSON.parse(blk.json) : {};
      } catch {
        args = {};
      }
      const fc = { name: blk.name, args, ...(blk.id ? { id: blk.id } : {}) };
      functionCalls.push(fc);
      modelParts.push({ functionCall: fc });
      callbacks.onFunctionCall?.(fc);
    }

    return {
      provider: 'anthropic',
      model: wireModel,
      thought: fullThought,
      text: fullText,
      functionCalls,
      modelParts,
      usageMetadata: usage
        ? {
            promptTokenCount: usage.input_tokens || 0,
            candidatesTokenCount: usage.output_tokens || 0,
            totalTokenCount: (usage.input_tokens || 0) + (usage.output_tokens || 0)
          }
        : null
    };
  }
}

const adapterRegistry = new Map();

export function registerModelAdapter(providerName, adapter) {
  adapterRegistry.set(providerName.toLowerCase(), adapter);
}

export function getModelAdapter(providerName = 'gemini') {
  const key = String(providerName).toLowerCase();
  if (adapterRegistry.has(key)) {
    return adapterRegistry.get(key);
  }

  if (key === 'gemini' || key === 'google') {
    const adapter = new GeminiModelAdapter();
    adapterRegistry.set(key, adapter);
    return adapter;
  }

  if (key === 'muse' || key === 'meta' || key === 'modal') {
    const adapter = new OpenAiCompatibleModelAdapter({
      providerName: 'meta',
      apiKeyGetter: () =>
        process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET
          ? `${process.env.MODAL_PROXY_TOKEN_ID}.${process.env.MODAL_PROXY_TOKEN_SECRET}`
          : process.env.MODAL_API_KEY || getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY'),
      baseUrlGetter: () =>
        process.env.MODAL_MUSE_SPARK_URL ||
        'https://edelobi--ep-muse-spark-open-816b-a42b-server.us-west.modal.direct/v1',
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
    adapterRegistry.set('muse', adapter);
    adapterRegistry.set('meta', adapter);
    adapterRegistry.set('modal', adapter);
    return adapter;
  }

  if (key === 'openai') {
    const adapter = new OpenAiCompatibleModelAdapter({
      providerName: 'openai',
      apiKeyGetter: () => getApiKey('OPENAI_API_KEY'),
      baseUrlGetter: () => process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
      modelResolver: (m) => m || 'gpt-4o'
    });
    adapterRegistry.set('openai', adapter);
    return adapter;
  }

  if (key === 'kimi' || key === 'moonshot') {
    const adapter = new OpenAiCompatibleModelAdapter({
      providerName: 'kimi',
      apiKeyGetter: () => getApiKey('KIMI_API_KEY') || getApiKey('MOONSHOT_API_KEY'),
      baseUrlGetter: () => process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
      defaultModel: 'moonshot-v1-auto',
      modelResolver: (m) => m || 'moonshot-v1-auto'
    });
    adapterRegistry.set(key, adapter);
    return adapter;
  }

  if (key === 'anthropic' || key === 'spark') {
    const adapter = new AnthropicModelAdapter({
      apiKeyGetter: () => getApiKey('ANTHROPIC_API_KEY'),
      baseUrlGetter: () => process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-5-sonnet-20241022',
      modelResolver: (m) => m || 'claude-3-5-sonnet-20241022'
    });
    adapterRegistry.set(key, adapter);
    return adapter;
  }

  if (key === 'deepseek') {
    const adapter = new OpenAiCompatibleModelAdapter({
      providerName: 'deepseek',
      apiKeyGetter: () => getApiKey('DEEPSEEK_API_KEY') || getApiKey('OPENAI_API_KEY'),
      baseUrlGetter: () => process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      modelResolver: (m) => m || 'deepseek-chat'
    });
    adapterRegistry.set(key, adapter);
    return adapter;
  }

  const adapter = new OpenAiCompatibleModelAdapter({
    providerName: key,
    apiKeyGetter: () => getApiKey('OPENAI_API_KEY') || getApiKey('API_KEY') || 'none',
    baseUrlGetter: () => process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    defaultModel: process.env.DEFAULT_MODEL || 'gpt-4o'
  });
  adapterRegistry.set(key, adapter);
  return adapter;
}

export function resolveProviderForModel(modelId = '') {
  const m = String(modelId || '').trim().toLowerCase();
  if (
    m.startsWith('meta-muse') ||
    m.startsWith('muse-') ||
    m.startsWith('meta-') ||
    m.startsWith('sam-')
  ) {
    return 'muse';
  }
  if (m.startsWith('claude-') || m.startsWith('sonnet-') || m.startsWith('opus-') || m.startsWith('haiku-') || m.startsWith('fable-') || m.startsWith('spark-')) return 'anthropic';
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.startsWith('chatgpt-')) return 'openai';
  if (m.startsWith('deepseek')) return 'deepseek';
  if (m.startsWith('kimi-') || m.startsWith('moonshot-')) return 'kimi';
  if (m.startsWith('gemini-')) return 'gemini';

  if (getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY')) return 'muse';
  if (getApiKey('OPENAI_API_KEY') || process.env.OPENAI_BASE_URL) return 'openai';
  if (getApiKey('ANTHROPIC_API_KEY')) return 'anthropic';
  if (getApiKey('DEEPSEEK_API_KEY')) return 'deepseek';
  if (getApiKey('KIMI_API_KEY') || getApiKey('MOONSHOT_API_KEY')) return 'kimi';
  if (getApiKey('GEMINI_API_KEY')) return 'gemini';

  return 'muse';
}

export async function streamModelTurn({
  contents,
  systemInstruction = '',
  model = process.env.DEFAULT_MODEL || 'muse-spark-open',
  tools = null,
  generationConfig = {},
  callbacks = {}
}) {
  const provider = resolveProviderForModel(model);
  const adapter = getModelAdapter(provider);

  if (!adapter.isConfigured()) {
    throw new Error(`[ModelAdapter] Model "${model}" belongs to provider "${provider}", but its API key is not configured.`);
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
