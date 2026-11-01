/**
 * gemini-protocol.js
 *
 * Implements Gemini 3 multi-turn stateless function-calling and thought-signature
 * protocol handling according to official Google Gemini specifications:
 * - https://ai.google.dev/gemini-api/docs/thinking#signatures
 * - https://ai.google.dev/gemini-api/docs/function-calling
 *
 * Preserves structured functionCall, functionResponse, thought blocks ({ thought: true }),
 * and thoughtSignature metadata without flattening to text strings.
 */

/**
 * Consolidates streamed SSE parts or raw candidate parts into valid Gemini Parts,
 * merging contiguous thought/text chunks while preserving all thoughtSignature
 * metadata, structured functionCall parts, and structured functionResponse parts.
 */
export function consolidateGeminiParts(rawParts) {
  if (!Array.isArray(rawParts)) return [];
  const consolidated = [];

  for (const part of rawParts) {
    if (!part || typeof part !== 'object') continue;
    const sig = part.thoughtSignature || part.thought_signature;

    // 1. Thought part (or thought delta)
    if (part.thought === true) {
      const textVal = typeof part.text === 'string' ? part.text : '';
      const prev = consolidated[consolidated.length - 1];
      if (
        prev &&
        prev.thought === true &&
        !prev.functionCall &&
        !prev.functionResponse &&
        (!prev.thoughtSignature || !sig || prev.thoughtSignature === sig)
      ) {
        prev.text = (prev.text || '') + textVal;
        if (sig) prev.thoughtSignature = sig;
        if (part.thought_signature) prev.thought_signature = part.thought_signature;
      } else {
        const thoughtPart = {
          text: textVal,
          thought: true
        };
        if (sig) thoughtPart.thoughtSignature = sig;
        if (part.thought_signature) thoughtPart.thought_signature = part.thought_signature;
        consolidated.push(thoughtPart);
      }
      continue;
    }

    // 2. Structured functionCall part
    if (part.functionCall && typeof part.functionCall === 'object') {
      const fcPart = {
        functionCall: {
          name: String(part.functionCall.name || 'tool'),
          args:
            part.functionCall.args && typeof part.functionCall.args === 'object'
              ? part.functionCall.args
              : {},
          ...(part.functionCall.id ? { id: part.functionCall.id } : {})
        }
      };
      if (sig) fcPart.thoughtSignature = sig;
      if (part.thought_signature) fcPart.thought_signature = part.thought_signature;
      consolidated.push(fcPart);
      continue;
    }

    // 3. Structured functionResponse part
    if (part.functionResponse && typeof part.functionResponse === 'object') {
      const frPart = {
        functionResponse: {
          name: String(part.functionResponse.name || 'tool'),
          response:
            part.functionResponse.response && typeof part.functionResponse.response === 'object'
              ? part.functionResponse.response
              : { result: part.functionResponse.response ?? '' },
          ...(part.functionResponse.id ? { id: part.functionResponse.id } : {})
        }
      };
      if (sig) frPart.thoughtSignature = sig;
      if (part.thought_signature) frPart.thought_signature = part.thought_signature;
      consolidated.push(frPart);
      continue;
    }

    // 4. Regular text part
    if (typeof part.text === 'string') {
      const prev = consolidated[consolidated.length - 1];
      if (
        prev &&
        !prev.thought &&
        typeof prev.text === 'string' &&
        !prev.functionCall &&
        !prev.functionResponse &&
        (!prev.thoughtSignature || !sig || prev.thoughtSignature === sig)
      ) {
        prev.text += part.text;
        if (sig) prev.thoughtSignature = sig;
        if (part.thought_signature) prev.thought_signature = part.thought_signature;
      } else {
        const textPart = { text: part.text };
        if (sig) textPart.thoughtSignature = sig;
        if (part.thought_signature) textPart.thought_signature = part.thought_signature;
        consolidated.push(textPart);
      }
      continue;
    }

    // 5. Standalone signature part or other valid Gemini part (inlineData, etc.)
    consolidated.push({ ...part });
  }

  return consolidated;
}

/**
 * Normalizes user messages or full Gemini multi-turn contents, preserving
 * thought blocks, thoughtSignatures, and structured function calls/responses.
 */
export function normalizeGeminiContents(promptOrContents) {
  if (!Array.isArray(promptOrContents)) {
    return [{ role: 'user', parts: [{ text: String(promptOrContents || '') }] }];
  }

  const normalized = [];
  for (const item of promptOrContents) {
    if (!item) continue;
    const role = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';

    let rawParts = [];
    if (Array.isArray(item.parts)) {
      rawParts = item.parts;
    } else if (typeof item.content === 'string' && item.content.trim()) {
      rawParts = [{ text: item.content }];
    } else if (Array.isArray(item.content)) {
      rawParts = item.content
        .map((c) => {
          if (typeof c === 'string') return { text: c };
          if (c?.inlineData) return c;
          if (c?.text) return { text: c.text };
          if (c?.dataUrl && (c.type || c.dataUrl.startsWith('data:'))) {
            const comma = c.dataUrl.indexOf(',');
            const mime = c.type || c.dataUrl.slice(5, comma).split(';')[0] || 'application/octet-stream';
            return {
              inlineData: {
                mimeType: mime,
                data: comma !== -1 ? c.dataUrl.slice(comma + 1) : c.dataUrl
              }
            };
          }
          return null;
        })
        .filter(Boolean);
    } else if (typeof item.text === 'string' && item.text.trim()) {
      rawParts = [{ text: item.text }];
    }

    if (Array.isArray(item.attachments)) {
      for (const att of item.attachments) {
        if (att?.dataUrl?.startsWith('data:')) {
          const comma = att.dataUrl.indexOf(',');
          const mime = att.type || att.dataUrl.slice(5, comma).split(';')[0] || 'application/octet-stream';
          const base64 = att.dataUrl.slice(comma + 1);
          if (
            mime.startsWith('audio/') ||
            mime.startsWith('image/') ||
            mime.startsWith('video/') ||
            mime === 'application/pdf'
          ) {
            rawParts.push({ inlineData: { mimeType: mime, data: base64 } });
          }
        }
      }
    }

    const cleanParts = consolidateGeminiParts(rawParts);
    if (cleanParts.length === 0) continue;

    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role) {
      prev.parts = consolidateGeminiParts([...prev.parts, ...cleanParts]);
    } else {
      normalized.push({
        role,
        parts: cleanParts
      });
    }
  }

  if (normalized.length === 0) {
    return [{ role: 'user', parts: [{ text: 'Hello' }] }];
  }
  return normalized;
}

/**
 * Builds structured functionResponse parts matching preceding functionCalls.
 */
export function buildFunctionResponseParts(toolResults) {
  if (!Array.isArray(toolResults)) return [];
  return toolResults.map((tr) => ({
    functionResponse: {
      name: tr.name,
      ...(tr.id ? { id: tr.id } : {}),
      response:
        tr.response && typeof tr.response === 'object'
          ? tr.response
          : { result: tr.result ?? tr.output ?? tr.content ?? '' }
    }
  }));
}

/**
 * Recursively cleans schema objects for Google Gemini API:
 * - Ensures any schema with type "ARRAY" or "array" specifies valid "items"
 * - Strips disallowed internal schema keys
 */
function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const clone = { ...schema };
  const typeStr = String(clone.type || '').toUpperCase();

  if (typeStr === 'ARRAY' && !clone.items) {
    clone.items = { type: 'STRING' };
  }

  if (clone.properties && typeof clone.properties === 'object') {
    const nextProps = {};
    for (const [k, v] of Object.entries(clone.properties)) {
      nextProps[k] = sanitizeGeminiSchema(v);
    }
    clone.properties = nextProps;
  }

  if (clone.items && typeof clone.items === 'object') {
    clone.items = sanitizeGeminiSchema(clone.items);
  }

  return clone;
}

/**
 * Converts internal tool definitions to strict Gemini functionDeclarations,
 * stripping internal properties like `readOnly` that trigger Google API 400 Bad Request.
 */
export function toGeminiFunctionDeclarations(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => ({
    name: t.name,
    description: t.description || '',
    parameters: sanitizeGeminiSchema(t.parameters || { type: 'OBJECT', properties: {} })
  }));
}
