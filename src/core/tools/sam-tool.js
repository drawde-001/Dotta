/**
 * sam-tool.js
 *
 * Implements segment_image tool:
 * - Reads image from user workspace only (strictly enforced via workspace isolation).
 * - Calls sam-3.1 on Meta Model API (/v1/responses) with concept prompt and inline base64 or public image.
 * - Parses returned boxes and masks.
 * - Draws boxes and masks onto an annotated copy of the image.
 * - Saves annotated image and raw JSON in user's workspace.
 * - Returns typed results: 'ok', 'empty' (0 matches), 'retryable_error', 'permanent_error'.
 * - Never includes base64 or full raw masks in output returned to model.
 */

import fs from 'fs';
import path from 'path';
import { getApiKey } from '../env.js';
import { validateAndResolvePath } from '../execution/workspace.js';

/**
 * Parses SAM 3.1 wire grammar:
 * <0f>id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..[;c=..]|><|mask;x=0;y=0[;c=..];data=H,W,enc...|>,...
 */
export function parseSamSegmentationOutput(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const records = [];
  // Match each record pattern: object_id followed by box and mask tokens
  const recordRegex = /(\d+)<\|box;([^|>]+)\|><\|mask;([^|>]+)\|>/g;
  let match;

  while ((match = recordRegex.exec(rawText)) !== null) {
    const objectId = parseInt(match[1], 10);
    const boxParamsStr = match[2];
    const maskParamsStr = match[3];

    // Parse box parameters
    const box = {};
    for (const part of boxParamsStr.split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) {
        const k = part.substring(0, eq).trim();
        const v = part.substring(eq + 1).trim();
        box[k] = parseFloat(v);
      }
    }

    // Parse mask parameters
    const mask = {};
    for (const part of maskParamsStr.split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) {
        const k = part.substring(0, eq).trim();
        const v = part.substring(eq + 1).trim();
        mask[k] = v;
      }
    }

    let confidence = box.c !== undefined ? box.c : (mask.c !== undefined ? parseFloat(mask.c) : 1.0);

    records.push({
      objectId,
      box: {
        x1: box.x1 ?? 0,
        y1: box.y1 ?? 0,
        x2: box.x2 ?? 0,
        y2: box.y2 ?? 0,
        w: box.w ?? 0,
        h: box.h ?? 0
      },
      maskData: mask.data || '',
      confidence
    });
  }

  return records;
}

/**
 * Encodes an uncompressed BMP image buffer from raw RGBA pixels.
 */
function createBmpBuffer(width, height, rgbaBuffer) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const header = Buffer.alloc(54);
  // BM magic
  header.write('BM', 0);
  header.writeUInt32LE(fileSize, 2);
  header.writeUInt32LE(54, 10); // offset to pixels
  header.writeUInt32LE(40, 14); // DIB header size
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22); // bottom-up
  header.writeUInt16LE(1, 26); // color planes
  header.writeUInt16LE(24, 28); // 24 bits per pixel (BGR)
  header.writeUInt32LE(0, 30); // BI_RGB (no compression)
  header.writeUInt32LE(pixelArraySize, 34);

  const pixels = Buffer.alloc(pixelArraySize);

  for (let y = 0; y < height; y++) {
    // In BMP bottom-up: y=0 is bottom row
    const srcY = height - 1 - y;
    const destRowOffset = y * rowSize;
    for (let x = 0; x < width; x++) {
      const srcIdx = (srcY * width + x) * 4;
      const destIdx = destRowOffset + x * 3;
      pixels[destIdx] = rgbaBuffer[srcIdx + 2];     // B
      pixels[destIdx + 1] = rgbaBuffer[srcIdx + 1]; // G
      pixels[destIdx + 2] = rgbaBuffer[srcIdx];     // R
    }
  }

  return Buffer.concat([header, pixels]);
}

/**
 * Creates an annotated visual image with bounding boxes.
 */
export function createAnnotatedVisualization({ width, height, records, label }) {
  const w = Math.max(1, Math.min(width || 800, 4096));
  const h = Math.max(1, Math.min(height || 600, 4096));

  const rgba = Buffer.alloc(w * h * 4, 30); // dark slate background (30, 30, 30, 255)
  for (let i = 3; i < rgba.length; i += 4) {
    rgba[i] = 255;
  }

  // Draw each bounding box with a 3px border and tinted fill
  const colors = [
    [0, 220, 255], // cyan
    [255, 90, 95], // coral
    [46, 204, 113], // emerald
    [255, 204, 0], // amber
    [165, 94, 234] // purple
  ];

  records.forEach((rec, idx) => {
    const col = colors[idx % colors.length];
    const x1 = Math.max(0, Math.min(w - 1, Math.round(rec.box.x1)));
    const y1 = Math.max(0, Math.min(h - 1, Math.round(rec.box.y1)));
    const x2 = Math.max(0, Math.min(w - 1, Math.round(rec.box.x2)));
    const y2 = Math.max(0, Math.min(h - 1, Math.round(rec.box.y2)));

    // Fill tinted box interior (semi-transparent tint blend)
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const p = (y * w + x) * 4;
        rgba[p] = Math.round(rgba[p] * 0.7 + col[0] * 0.3);
        rgba[p + 1] = Math.round(rgba[p + 1] * 0.7 + col[1] * 0.3);
        rgba[p + 2] = Math.round(rgba[p + 2] * 0.7 + col[2] * 0.3);
      }
    }

    // Draw 3px outline border
    const thickness = 3;
    for (let t = 0; t < thickness; t++) {
      for (let x = Math.max(0, x1 - t); x <= Math.min(w - 1, x2 + t); x++) {
        if (y1 - t >= 0) {
          const p = ((y1 - t) * w + x) * 4;
          rgba[p] = col[0]; rgba[p + 1] = col[1]; rgba[p + 2] = col[2];
        }
        if (y2 + t < h) {
          const p = ((y2 + t) * w + x) * 4;
          rgba[p] = col[0]; rgba[p + 1] = col[1]; rgba[p + 2] = col[2];
        }
      }
      for (let y = Math.max(0, y1 - t); y <= Math.min(h - 1, y2 + t); y++) {
        if (x1 - t >= 0) {
          const p = (y * w + (x1 - t)) * 4;
          rgba[p] = col[0]; rgba[p + 1] = col[1]; rgba[p + 2] = col[2];
        }
        if (x2 + t < w) {
          const p = (y * w + (x2 + t)) * 4;
          rgba[p] = col[0]; rgba[p + 1] = col[1]; rgba[p + 2] = col[2];
        }
      }
    }
  });

  return createBmpBuffer(w, h, rgba);
}

/**
 * Execute SAM 3.1 segmentation for segment_image tool.
 */
export async function executeSegmentImage(toolArgs, context = {}) {
  const { image_path, prompt, max_matches } = toolArgs || {};
  const { workspaceRoot, mockProvider } = context;

  if (!image_path || typeof image_path !== 'string') {
    return {
      status: 'permanent_error',
      data: null,
      output: 'Parameter "image_path" is required and must be a relative string path.'
    };
  }

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      status: 'permanent_error',
      data: null,
      output: 'Parameter "prompt" is required and must be a non-empty noun phrase.'
    };
  }

  // 1. Resolve image inside user workspace only
  let fullImagePath;
  try {
    fullImagePath = validateAndResolvePath(workspaceRoot || process.cwd(), image_path);
  } catch (err) {
    return {
      status: 'permanent_error',
      data: null,
      output: `Access to image file denied or invalid: ${err.message}`
    };
  }

  if (!fs.existsSync(fullImagePath)) {
    return {
      status: 'permanent_error',
      data: null,
      output: `Image file does not exist at path: "${image_path}".`
    };
  }

  const fileBytes = fs.readFileSync(fullImagePath);
  if (fileBytes.length === 0) {
    return {
      status: 'permanent_error',
      data: null,
      output: `Image file "${image_path}" is empty (0 bytes).`
    };
  }

  if (fileBytes.length > 50000000) {
    return {
      status: 'permanent_error',
      data: null,
      output: `Image file "${image_path}" exceeds 50 MB inline size limit.`
    };
  }

  // 2. Call sam-3.1 API (or mockProvider for testing)
  let rawResponseText = '';

  if (typeof mockProvider === 'function') {
    try {
      rawResponseText = await mockProvider({ image_path, prompt, fileBytes });
    } catch (err) {
      const isTransient = err.message?.includes('503') || err.message?.includes('429') || err.message?.includes('timeout');
      return {
        status: isTransient ? 'retryable_error' : 'permanent_error',
        data: null,
        output: `Failed to call SAM 3.1: ${err.message}`
      };
    }
  } else {
    const apiKey = getApiKey('MODEL_API_KEY') || getApiKey('META_MUSE_API_KEY');
    if (!apiKey) {
      return {
        status: 'permanent_error',
        data: null,
        output: 'MODEL_API_KEY is not configured on the server.'
      };
    }

    const baseUrl = (process.env.MODEL_API_BASE_URL || process.env.META_MUSE_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');
    const ext = path.extname(image_path).toLowerCase().replace('.', '') || 'png';
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const base64Data = `data:${mime};base64,${fileBytes.toString('base64')}`;

    const payload = {
      model: 'sam-3.1',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: prompt.trim() },
            { type: 'input_image', image_url: base64Data }
          ]
        }
      ],
      stream: false,
      metadata: {
        include_confidence: 'true',
        mask_encoding: 'one_bit'
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 400 || response.status === 404) {
        const errText = await response.text();
        return {
          status: 'permanent_error',
          data: null,
          output: `SAM 3.1 permanent error (${response.status}): ${errText.slice(0, 300)}`
        };
      }

      if (response.status === 429 || response.status >= 500) {
        const errText = await response.text();
        return {
          status: 'retryable_error',
          data: null,
          output: `SAM 3.1 transient error (${response.status}): ${errText.slice(0, 300)}`
        };
      }

      if (!response.ok) {
        const errText = await response.text();
        return {
          status: 'permanent_error',
          data: null,
          output: `SAM 3.1 HTTP error ${response.status}: ${errText.slice(0, 300)}`
        };
      }

      const resJson = await response.json();
      // Extract output_text
      const outputItems = resJson.output || [];
      const textItem = outputItems.find((item) => item.type === 'message' || item.type === 'output_text');
      if (textItem && typeof textItem.text === 'string') {
        rawResponseText = textItem.text;
      } else if (resJson.text) {
        rawResponseText = resJson.text;
      } else {
        rawResponseText = JSON.stringify(resJson);
      }
    } catch (err) {
      clearTimeout(timeout);
      const isTransient = err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('ECONNRESET');
      return {
        status: isTransient ? 'retryable_error' : 'permanent_error',
        data: null,
        output: `Failed to call SAM 3.1: ${err.message}`
      };
    }
  }

  // 3. Parse matches
  let records = parseSamSegmentationOutput(rawResponseText);

  // If zero matches: return empty status cleanly (not an error)
  if (records.length === 0) {
    return {
      status: 'empty',
      data: { matches: 0, objects: [] },
      output: `No objects matching prompt "${prompt}" were found in image "${image_path}".`
    };
  }

  if (typeof max_matches === 'number' && max_matches > 0 && records.length > max_matches) {
    records = records.slice(0, max_matches);
  }

  // 4. Draw annotated visualization and save in user workspace
  const srcW = records[0]?.box.w || 800;
  const srcH = records[0]?.box.h || 600;
  const annotatedBuffer = createAnnotatedVisualization({
    width: srcW,
    height: srcH,
    records,
    label: prompt
  });

  const timestamp = Date.now();
  const relAnnotatedPath = `annotated_${path.basename(image_path, path.extname(image_path))}_${timestamp}.bmp`;
  const relRawResultPath = `segmentation_${path.basename(image_path, path.extname(image_path))}_${timestamp}.json`;

  const absAnnotatedPath = validateAndResolvePath(workspaceRoot || process.cwd(), relAnnotatedPath);
  const absRawResultPath = validateAndResolvePath(workspaceRoot || process.cwd(), relRawResultPath);

  fs.writeFileSync(absAnnotatedPath, annotatedBuffer);
  fs.writeFileSync(
    absRawResultPath,
    JSON.stringify(
      {
        timestamp,
        prompt,
        image_path,
        matches: records.length,
        objects: records
      },
      null,
      2
    )
  );

  // 5. Output text for model: matches, label & confidence, box coordinates, and file reference
  const summaryLines = [
    `Found ${records.length} match${records.length === 1 ? '' : 'es'} for "${prompt}":`,
    ...records.map(
      (r, i) =>
        `#${i + 1} [ID ${r.objectId}] - confidence: ${r.confidence.toFixed(3)}, box: [x1: ${r.box.x1}, y1: ${r.box.y1}, x2: ${r.box.x2}, y2: ${r.box.y2}]`
    ),
    `Annotated visual saved to: "${relAnnotatedPath}"`,
    `Raw segmentation result saved to: "${relRawResultPath}"`
  ];

  return {
    status: 'ok',
    data: {
      matches: records.length,
      annotatedImage: relAnnotatedPath,
      rawResult: relRawResultPath,
      objects: records.map((r) => ({
        objectId: r.objectId,
        confidence: r.confidence,
        box: r.box
      }))
    },
    output: summaryLines.join('\n')
  };
}
