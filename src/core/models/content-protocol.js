/**
 * content-protocol.js
 *
 * Implements multi-turn agent message, part, and tool-call normalization
 * for Meta Muse and multimodal agent runs.
 *
 * Preserves structured functionCall, functionResponse, thought blocks ({ thought: true }),
 * and media parts (inlineData) without flattening to text strings.
 */

/**
 * Consolidates streamed message parts, merging contiguous thought/text chunks
 * while preserving structured functionCall and functionResponse parts.
 */
export function consolidateMessageParts(rawParts) {
  if (!Array.isArray(rawParts)) return [];
  const consolidated = [];

  for (const part of rawParts) {
    if (!part || typeof part !== 'object') continue;

    // 1. Thought part (or thought delta)
    if (part.thought === true) {
      const textVal = typeof part.text === 'string' ? part.text : '';
      const prev = consolidated[consolidated.length - 1];
      if (
        prev &&
        prev.thought === true &&
        !prev.functionCall &&
        !prev.functionResponse
      ) {
        prev.text = (prev.text || '') + textVal;
      } else {
        consolidated.push({
          text: textVal,
          thought: true
        });
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
        !prev.functionResponse
      ) {
        prev.text += part.text;
      } else {
        consolidated.push({ text: part.text });
      }
      continue;
    }

    // 5. Standalone media or inlineData parts
    consolidated.push({ ...part });
  }

  return consolidated;
}

/**
 * Normalizes user messages or full multi-turn contents, preserving
 * thought blocks, attachments, and structured function calls/responses.
 */
export function normalizeThreadContents(promptOrContents) {
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

    const cleanParts = consolidateMessageParts(rawParts);
    if (cleanParts.length === 0) continue;

    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role) {
      prev.parts = consolidateMessageParts([...prev.parts, ...cleanParts]);
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
