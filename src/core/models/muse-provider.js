/**
 * muse-provider.js
 *
 * Real Meta Muse Spark provider. Talks to Meta's OpenAI-compatible
 * Chat Completions endpoint (POST {base}/chat/completions, Bearer auth) and
 * returns the SAME turn shape as callModelStream so the agent loop
 * (tools, budgets, interrupts, persistence) works unchanged.
 */

import { getApiKey } from '../env.js';

export const MUSE_UI_MODEL_IDS = [
  'muse-spark-open',
  'muse-wonder-1.0',
  'muse-spark-1.3',
  'muse-spark-1.2',
  'muse-spark-1.1',
  'meta-muse-spark'
];

export function isMuseModel(id) {
  const m = String(id || '').toLowerCase();
  return (
    m.startsWith('meta-muse') ||
    m.startsWith('muse-') ||
    m === 'sam-3.1'
  );
}

/** Resolve the real provider model id from a UI model id. */
export function resolveMuseWireModel(requestedModel) {
  const req = String(requestedModel || '').trim();
  if (req.toLowerCase() === 'muse-spark-open') return 'muse-spark-open';
  if (req.toLowerCase().startsWith('muse-')) return req;
  if (req.toLowerCase() === 'meta-muse-spark') return 'muse-spark-open';
  return process.env.META_MUSE_MODEL || process.env.MODEL_ID || 'muse-spark-open';
}

/** Internal schema types are UPPERCASE; OpenAI JSON Schema needs lowercase. */
function toJsonSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toJsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'type' && typeof v === 'string') out[k] = v.toLowerCase();
    else if (k === 'readOnly') continue;
    else out[k] = toJsonSchema(v);
  }
  return out;
}

export function toOpenAiTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: toJsonSchema(t.parameters || { type: 'object', properties: {} })
    }
  }));
}

/** Internal turn contents -> OpenAI chat messages. */
export function toOpenAiMessages(contents, systemInstruction) {
  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });

  let idCounter = 0;
  let pendingToolCalls = []; // Array of { id, name }

  const flushMissingToolCalls = () => {
    while (pendingToolCalls.length > 0) {
      const missing = pendingToolCalls.shift();
      messages.push({
        role: 'tool',
        tool_call_id: missing.id,
        content: JSON.stringify({
          status: 'completed',
          output: `Completed / acknowledged for ${missing.name || 'tool'}`
        })
      });
    }
  };

  for (const item of contents) {
    const parts = Array.isArray(item.parts) ? item.parts : [];

    if (item.role === 'model' || item.role === 'assistant') {
      flushMissingToolCalls();

      const text = parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      const toolCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => {
          const id = p.functionCall.id || `call_${Date.now().toString(36)}_${idCounter++}`;
          return {
            id,
            type: 'function',
            function: {
              name: p.functionCall.name,
              arguments: JSON.stringify(p.functionCall.args || {})
            }
          };
        });

      if (!text && toolCalls.length === 0) continue;
      const msg = { role: 'assistant', content: text || null };
      if (toolCalls.length > 0) {
        msg.tool_calls = toolCalls;
        pendingToolCalls = toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name }));
      }
      messages.push(msg);
      continue;
    }

    // User turn:
    const frParts = parts.filter((p) => p.functionResponse);
    for (const p of frParts) {
      const fr = p.functionResponse;
      const name = fr.name;
      let matchedIdx = -1;
      if (fr.id) {
        matchedIdx = pendingToolCalls.findIndex((tc) => tc.id === fr.id);
      }
      if (matchedIdx === -1 && name) {
        matchedIdx = pendingToolCalls.findIndex((tc) => tc.name === name);
      }

      let toolCallId = fr.id;
      if (matchedIdx !== -1) {
        toolCallId = pendingToolCalls[matchedIdx].id;
        pendingToolCalls.splice(matchedIdx, 1);
      } else if (!toolCallId) {
        toolCallId = `call_${Date.now().toString(36)}_${idCounter++}`;
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: typeof fr.response === 'string' ? fr.response : JSON.stringify(fr.response ?? {})
      });
    }

    flushMissingToolCalls();

    const userContent = [];
    for (const p of parts) {
      if (p.thought) continue;
      if (typeof p.text === 'string' && p.text) {
        userContent.push({ type: 'text', text: p.text });
      } else if (p.inlineData?.data && /^image\//.test(p.inlineData.mimeType || '')) {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` }
        });
      }
    }
    if (userContent.length > 0) {
      const onlyText = userContent.every((c) => c.type === 'text');
      messages.push({
        role: 'user',
        content: onlyText ? userContent.map((c) => c.text).join('\n') : userContent
      });
    }
  }

  flushMissingToolCalls();

  const sanitized = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    sanitized.push(m);
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const requiredIds = new Set(m.tool_calls.map((tc) => tc.id));
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') {
        requiredIds.delete(messages[j].tool_call_id);
        sanitized.push(messages[j]);
        j++;
      }
      i = j - 1;

      for (const missingId of requiredIds) {
        const tcObj = m.tool_calls.find((tc) => tc.id === missingId);
        sanitized.push({
          role: 'tool',
          tool_call_id: missingId,
          content: JSON.stringify({
            status: 'completed',
            output: `Acknowledged response for ${tcObj?.function?.name || 'tool'}`
          })
        });
      }
    }
  }

  return sanitized;
}

/**
 * Streams one model turn from Meta Muse.
 */
export async function callMuseStream({
  apiKey,
  contents,
  systemInstruction = '',
  requestedModel,
  callbacks = {},
  tools = null,
  generationConfig = {}
}) {
  const reqModel = String(requestedModel || '').toLowerCase();
  const isModal = reqModel === 'muse-spark-open' || reqModel.includes('open') || reqModel.includes('816b') || Boolean(process.env.MODAL_PROXY_TOKEN_ID);

  let model = resolveMuseWireModel(requestedModel);
  let baseUrl;
  let activeKey;

  if (isModal) {
    model = 'meta-models/Muse-Spark-Open-816B-A42B';
    baseUrl = (process.env.MODAL_MUSE_SPARK_URL || 'https://edelobi--ep-muse-spark-open-816b-a42b-server.us-west.modal.direct/v1').replace(/\/+$/, '');
    
    if (process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET) {
      activeKey = `${process.env.MODAL_PROXY_TOKEN_ID}.${process.env.MODAL_PROXY_TOKEN_SECRET}`;
    } else {
      activeKey = process.env.MODAL_API_KEY || apiKey || getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY');
    }
  } else {
    baseUrl = (process.env.MODEL_API_BASE_URL || process.env.META_MUSE_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');
    activeKey = apiKey || getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY');
  }

  if (!activeKey) {
    throw new Error('MODAL_PROXY_TOKEN_ID & MODAL_PROXY_TOKEN_SECRET (or MODEL_API_KEY) are not set in .env.');
  }

  const payload = {
    model,
    messages: toOpenAiMessages(contents, systemInstruction),
    stream: true,
    stream_options: { include_usage: true },
    temperature: generationConfig?.temperature ?? 0.3,
    top_p: generationConfig?.topP ?? 0.95,
    reasoning_effort: generationConfig?.reasoningEffort || 'medium'
  };
  const oaiTools = toOpenAiTools(tools);
  if (oaiTools) {
    payload.tools = oaiTools;
    payload.tool_choice = 'auto';
  }
  if (generationConfig?.maxOutputTokens) payload.max_tokens = generationConfig.maxOutputTokens;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (e) {
    if (isModal) {
      console.warn(`[MuseProvider] Primary Modal endpoint failed (${e.message}). Attempting fallback to Meta Muse / Fireworks...`);
      const fallbackBase = (process.env.MODEL_API_BASE_URL || process.env.META_MUSE_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');
      const fallbackKey = apiKey || getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY');
      if (fallbackKey && fallbackBase !== baseUrl) {
        payload.model = 'muse-spark-1.3';
        response = await fetch(`${fallbackBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${fallbackKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        }).catch(() => null);
      }
    }
    if (!response) {
      clearTimeout(timer);
      throw new Error(`Could not reach Meta Muse API at ${baseUrl}: ${e.message}`);
    }
  }

  if (!response.ok) {
    if (isModal) {
      console.warn(`[MuseProvider] Primary Modal endpoint HTTP ${response.status}. Attempting fallback to Meta Muse / Fireworks...`);
      const fallbackBase = (process.env.MODEL_API_BASE_URL || process.env.META_MUSE_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');
      const fallbackKey = apiKey || getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY');
      if (fallbackKey && fallbackBase !== baseUrl) {
        payload.model = 'muse-spark-1.3';
        const fallbackRes = await fetch(`${fallbackBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${fallbackKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        }).catch(() => null);
        if (fallbackRes && fallbackRes.ok) {
          response = fallbackRes;
        }
      }
    }
    if (!response.ok) {
      clearTimeout(timer);
      const errText = await response.text().catch(() => '');
      throw new Error(`Meta Muse API HTTP ${response.status} (${model}): ${errText.slice(0, 500)}`);
    }
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
    throw new Error(`Meta Muse stream interrupted: ${e.message}`);
  } finally {
    clearTimeout(timer);
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

  // Fallback for open-weight models: parse tool call if emitted inside markdown codeblock
  if (functionCalls.length === 0 && fullText) {
    try {
      const codeBlockMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*?"(?:name|tool)"\s*:\s*"[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        const parsed = JSON.parse(codeBlockMatch[1]);
        const toolName = parsed.name || parsed.tool;
        const toolArgs = parsed.args || parsed.parameters || parsed.arguments || {};
        if (toolName) {
          const fc = {
            name: toolName,
            args: typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs,
            id: `call_fb_${Date.now().toString(36)}`
          };
          functionCalls.push(fc);
          modelParts.push({ functionCall: fc });
          callbacks.onFunctionCall?.(fc);
        }
      }
    } catch {}
  }

  if (!fullText && !fullThought && functionCalls.length === 0) {
    throw new Error(`Meta Muse (${model}) returned an empty response.`);
  }

  return {
    model,
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
