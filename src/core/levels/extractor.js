/**
 * extractor.js
 *
 * Level 2A: Deterministic Code-Only Form Schema Extractor (no model).
 * Runs inside the Level 1 Browser Sandbox, inspects the DOM & accessibility tree,
 * excludes hidden/off-screen/zero-opacity/tiny-font elements and aria-label mismatches,
 * and outputs a strict FormSchema JSON. Also extracts plain text from files in code.
 */

import { sanitizeExtractedString, isInstructionLikeText } from './sanitizer.js';
import { validateFormSchema } from './schema.js';
import { extractFileText } from '../bio/executors.js';

export function normalizeLabelForComparison(raw = '') {
  const { text } = sanitizeExtractedString(raw, 140);
  return text
    .replace(/\*+$/g, '')
    .replace(/\s*\((required|optional|obligatoire|pflichtfeld|requerido|必須|必填)\)\s*$/iu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Check if inline CSS style string hides an element visually.
 */
export function isStyleHiddenOrDeceptive(styleStr = '') {
  const s = String(styleStr || '').toLowerCase();
  if (!s) return { hidden: false, reason: null };

  if (/display\s*:\s*none/.test(s)) return { hidden: true, reason: 'display:none' };
  if (/visibility\s*:\s*hidden/.test(s)) return { hidden: true, reason: 'visibility:hidden' };

  const opacityMatch = s.match(/opacity\s*:\s*([0-9.]+)/);
  if (opacityMatch && Number(opacityMatch[1]) <= 0.05) {
    return { hidden: true, reason: `opacity:${opacityMatch[1]}` };
  }

  const fontMatch = s.match(/font-size\s*:\s*([0-9.]+)\s*(px|pt|rem|em)?/);
  if (fontMatch && Number(fontMatch[1]) < 2) {
    return { hidden: true, reason: `font-size:${fontMatch[1]}${fontMatch[2] || 'px'}` };
  }

  if (/(left|top)\s*:\s*-[1-9][0-9]{2,}px/.test(s)) {
    return { hidden: true, reason: 'offscreen_negative_coords' };
  }

  if (/width\s*:\s*[01](\.0+)?px/.test(s) && /height\s*:\s*[01](\.0+)?px/.test(s)) {
    return { hidden: true, reason: 'zero_dimensions' };
  }

  // Same foreground and background color (e.g. color:#fff; background:#fff or color:white; background-color:white)
  const colorMatch = s.match(/(?:^|;|\s)color\s*:\s*([^;]+)/);
  const bgMatch = s.match(/background(?:-color)?\s*:\s*([^;]+)/);
  if (colorMatch && bgMatch) {
    const fg = colorMatch[1].trim().replace(/\s+/g, '');
    const bg = bgMatch[1].trim().replace(/\s+/g, '');
    if (fg && bg && fg === bg) {
      return { hidden: true, reason: `same_fg_bg_color:${fg}` };
    }
  }

  return { hidden: false, reason: null };
}

function parseAttributes(attrString = '') {
  const attrs = {};
  const rx = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = rx.exec(attrString)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    attrs[key] = val;
  }
  return attrs;
}

/**
 * Deterministic HTML/DOM parser for Level 2A extraction (works both inside Node
 * tests/sandboxes and when given raw HTML + computed visibility metadata from Playwright).
 */
export function extractFormSchemaFromHtml(html = '', { url = 'about:blank', title = '' } = {}) {
  const rawHtml = String(html || '');
  const excludedElements = [];
  const scannerNotes = [];

  // 1. Strip HTML comments and record if they contained injection-like text
  const commentRx = /<!--([\s\S]*?)-->/g;
  let cm;
  while ((cm = commentRx.exec(rawHtml)) !== null) {
    const commentBody = cm[1] || '';
    if (isInstructionLikeText(commentBody).instructionLike) {
      scannerNotes.push({
        source: 'html_comment',
        reason: 'hidden_html_comment_injection_stripped',
        preview: sanitizeExtractedString(commentBody, 60).text
      });
    }
  }
  const cleanHtml = rawHtml
    .replace(commentRx, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // 2. Scan hidden containers (<div style="display:none">...</div>, <span aria-hidden="true">...</span>, etc.)
  const blockRx = /<(div|span|p|section|aside|label|small)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const hiddenSnippets = new Set();
  let bm;
  while ((bm = blockRx.exec(cleanHtml)) !== null) {
    const attrs = parseAttributes(bm[2]);
    const styleCheck = isStyleHiddenOrDeceptive(attrs.style || '');
    const isHiddenAttr =
      attrs.hidden !== undefined ||
      attrs['aria-hidden'] === 'true' ||
      styleCheck.hidden;
    if (isHiddenAttr) {
      hiddenSnippets.add(bm[0]);
      const innerText = sanitizeExtractedString(bm[3], 80).text;
      if (innerText) {
        excludedElements.push({
          tag: bm[1].toLowerCase(),
          reason: styleCheck.reason || (attrs['aria-hidden'] === 'true' ? 'aria-hidden' : 'hidden_attribute'),
          preview: innerText.slice(0, 60)
        });
      }
    }
  }

  let visibleHtml = cleanHtml;
  for (const snippet of hiddenSnippets) {
    visibleHtml = visibleHtml.replace(snippet, ' ');
  }

  // 3. Index explicit <label for="...">Visible Text</label>
  const labelsByFor = new Map();
  const labelRx = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let lm;
  while ((lm = labelRx.exec(visibleHtml)) !== null) {
    const lAttrs = parseAttributes(lm[1]);
    const lStyle = isStyleHiddenOrDeceptive(lAttrs.style || '');
    if (lStyle.hidden || lAttrs.hidden !== undefined || lAttrs['aria-hidden'] === 'true') {
      continue;
    }
    const innerWithoutInputs = lm[2].replace(/<(input|select|textarea)\b[^>]*>[\s\S]*?(?:<\/\1>)?/gi, ' ');
    const cleanText = sanitizeExtractedString(innerWithoutInputs, 140).text;
    if (lAttrs.for && cleanText) {
      labelsByFor.set(lAttrs.for, cleanText);
    }
  }

  // 4. Detect section headings (<legend>, <h2>, <h3>) by offset
  const headings = [];
  const headingRx = /<(legend|h1|h2|h3|h4)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let hm;
  while ((hm = headingRx.exec(visibleHtml)) !== null) {
    const hAttrs = parseAttributes(hm[2]);
    if (isStyleHiddenOrDeceptive(hAttrs.style || '').hidden) continue;
    const hText = sanitizeExtractedString(hm[3], 80).text;
    if (hText) {
      headings.push({ index: hm.index, text: hText });
    }
  }

  const sectionForIndex = (pos) => {
    let current = 'General';
    for (const h of headings) {
      if (h.index <= pos) current = h.text;
      else break;
    }
    return current;
  };

  // 5. Extract form controls (<input>, <select>, <textarea>)
  const fields = [];
  const radioGroups = new Map();
  const controlRx = /<(input|select|textarea)\b([^>]*)>([\s\S]*?<\/\1>)?/gi;
  let ctrlMatch;
  let idxCounter = 0;

  while ((ctrlMatch = controlRx.exec(visibleHtml)) !== null) {
    const tag = ctrlMatch[1].toLowerCase();
    const attrs = parseAttributes(ctrlMatch[2]);
    const innerHtml = ctrlMatch[3] || '';
    const rawType = (attrs.type || (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();

    if (rawType === 'submit' || rawType === 'button' || rawType === 'reset' || rawType === 'image') {
      continue;
    }

    const styleCheck = isStyleHiddenOrDeceptive(attrs.style || '');
    if (
      rawType === 'hidden' ||
      attrs.hidden !== undefined ||
      attrs['aria-hidden'] === 'true' ||
      styleCheck.hidden
    ) {
      excludedElements.push({
        tag,
        id: attrs.id || attrs.name || '',
        reason: rawType === 'hidden' ? 'type=hidden' : styleCheck.reason || 'hidden_control',
        preview: sanitizeExtractedString(attrs.value || attrs.placeholder || attrs.name || '', 60).text
      });
      continue;
    }

    const fieldId = attrs.id || '';
    const fieldName = attrs.name || '';
    const explicitLabel = (fieldId && labelsByFor.get(fieldId)) || '';

    // Check enclosing label if no for= match
    let enclosingLabel = '';
    if (!explicitLabel) {
      const beforeSlice = visibleHtml.slice(Math.max(0, ctrlMatch.index - 260), ctrlMatch.index);
      const openLabelMatch = beforeSlice.match(/<label\b[^>]*>([^<]*)$/i);
      if (openLabelMatch && openLabelMatch[1].trim()) {
        enclosingLabel = sanitizeExtractedString(openLabelMatch[1], 140).text;
      }
    }

    const visibleLabel = explicitLabel || enclosingLabel || sanitizeExtractedString(attrs.placeholder || fieldName || fieldId, 140).text;
    if (!visibleLabel) continue;

    // Check aria-label / title / data-* mismatch against visible label
    const ariaLabel = sanitizeExtractedString(attrs['aria-label'] || '', 140).text;
    const titleAttr = sanitizeExtractedString(attrs.title || '', 140).text;
    let ariaMismatchNote = '';

    if (ariaLabel && explicitLabel && normalizeLabelForComparison(ariaLabel) !== normalizeLabelForComparison(explicitLabel)) {
      scannerNotes.push({
        source: 'aria_label_mismatch',
        fieldId: fieldId || fieldName,
        visibleLabel: explicitLabel,
        ariaLabel: ariaLabel.slice(0, 60),
        reason: 'aria-label differs from visible <label>; ignoring aria-label'
      });
      ariaMismatchNote = 'aria_label_mismatch_ignored';
    }

    if (titleAttr && isInstructionLikeText(titleAttr).instructionLike) {
      scannerNotes.push({
        source: 'title_attr_injection',
        fieldId: fieldId || fieldName,
        reason: 'instruction-like title attribute ignored'
      });
    }

    // Check data-* attributes for prompt injection
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('data-') && isInstructionLikeText(v).instructionLike) {
        scannerNotes.push({
          source: `attr:${k}`,
          fieldId: fieldId || fieldName,
          reason: `instruction-like ${k} attribute ignored`
        });
      }
    }

    const required =
      attrs.required !== undefined ||
      attrs['aria-required'] === 'true' ||
      /\*\s*$/.test(visibleLabel) ||
      /\(required\)/i.test(visibleLabel);

    const section = sectionForIndex(ctrlMatch.index);
    const selector = fieldId
      ? `#${fieldId}`
      : fieldName
        ? `${tag}[name="${fieldName}"]`
        : `${tag}:nth-of-type(${++idxCounter})`;

    if (rawType === 'radio' && fieldName) {
      const optionVal = sanitizeExtractedString(attrs.value || visibleLabel, 80).text;
      if (!radioGroups.has(fieldName)) {
        const groupObj = {
          fieldKey: fieldName,
          selector: `input[type="radio"][name="${fieldName}"]`,
          label: explicitLabel || sanitizeExtractedString(fieldName, 140).text,
          normalizedLabel: normalizeLabelForComparison(explicitLabel || fieldName),
          type: 'radio',
          required,
          options: optionVal ? [optionVal] : [],
          section,
          visibility: 'visible',
          validationHints: ariaMismatchNote,
          conditionalOn: attrs['data-conditional-on'] || ''
        };
        radioGroups.set(fieldName, groupObj);
        fields.push(groupObj);
      } else if (optionVal) {
        radioGroups.get(fieldName).options.push(optionVal);
      }
      continue;
    }

    let options = [];
    if (tag === 'select') {
      const optRx = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
      let om;
      while ((om = optRx.exec(innerHtml)) !== null) {
        const oAttrs = parseAttributes(om[1]);
        if (isStyleHiddenOrDeceptive(oAttrs.style || '').hidden || oAttrs.hidden !== undefined) {
          continue;
        }
        const optText = sanitizeExtractedString(om[2] || oAttrs.value || '', 80).text;
        if (optText && !/^(--|select\b|choose\b)/i.test(optText)) {
          options.push(optText);
        }
      }
    }

    const normalizedType =
      tag === 'select'
        ? 'select'
        : tag === 'textarea'
          ? 'textarea'
          : ['text', 'email', 'tel', 'url', 'number', 'date', 'checkbox', 'file', 'password'].includes(rawType)
            ? rawType
            : 'text';

    idxCounter++;
    fields.push({
      fieldKey: fieldId || fieldName || `field_${idxCounter}`,
      selector,
      label: visibleLabel.replace(/\*+$/g, '').trim(),
      normalizedLabel: normalizeLabelForComparison(visibleLabel),
      type: normalizedType,
      required: Boolean(required),
      options,
      section,
      visibility: 'visible',
      validationHints: sanitizeExtractedString(attrs.pattern || ariaMismatchNote || '', 120).text,
      conditionalOn: sanitizeExtractedString(attrs['data-conditional-on'] || '', 80).text
    });
  }

  // 6. Extract submit/action buttons
  const submitButtons = [];
  const btnRx = /<button\b([^>]*)>([\s\S]*?)<\/button>|<input\b([^>]*)>/gi;
  let btnMatch;
  while ((btnMatch = btnRx.exec(visibleHtml)) !== null) {
    const isButtonTag = btnMatch[1] !== undefined;
    const tag = isButtonTag ? 'button' : 'input';
    const attrs = parseAttributes(isButtonTag ? btnMatch[1] : btnMatch[3]);
    if (isStyleHiddenOrDeceptive(attrs.style || '').hidden || attrs.hidden !== undefined) continue;
    const t = (attrs.type || (isButtonTag ? 'submit' : '')).toLowerCase();
    if (!isButtonTag && t !== 'submit' && t !== 'button') continue;
    const label = sanitizeExtractedString(
      isButtonTag ? btnMatch[2] || attrs.value || 'Submit' : attrs.value || 'Submit',
      80
    ).text;
    if (label) {
      submitButtons.push({
        label,
        type: t || 'submit',
        selector: attrs.id ? `#${attrs.id}` : `${tag}[type="${t || 'submit'}"]`
      });
    }
  }

  // 7. Extract visible plain text for Level 2B Reader (never includes Extractor's schema!)
  const visiblePageText = buildVisiblePageTextFromCleanHtml(visibleHtml, { fields, submitButtons, headings });

  const validation = validateFormSchema(
    {
      url,
      title: sanitizeExtractedString(title, 120).text,
      sections: [...new Set(fields.map((f) => f.section))],
      fields,
      submitButtons
    },
    'extractor_2a'
  );

  return {
    valid: validation.valid,
    schema: validation.data,
    excludedElements,
    scannerNotes,
    visiblePageText
  };
}

function buildVisiblePageTextFromCleanHtml(visibleHtml, { fields, submitButtons, headings }) {
  const lines = [];
  if (headings.length > 0) {
    for (const h of headings) {
      lines.push(`## ${h.text}`);
    }
  }
  for (const f of fields) {
    const reqTag = f.required ? ' (required)' : ' (optional)';
    const optsTag = f.options?.length ? ` [options: ${f.options.join(' | ')}]` : '';
    lines.push(`Field: ${f.label}${reqTag} [type: ${f.type}] [section: ${f.section}]${optsTag}`);
  }
  for (const b of submitButtons) {
    lines.push(`Button: ${b.label}`);
  }
  return lines.join('\n');
}

/**
 * Extract plain text from a file (PDF, text, etc.) in code inside Level 2A without calling a model.
 */
export async function extractPlainTextInCode(absPath, mime = '', name = '') {
  const raw = await extractFileText(absPath, mime, name);
  return sanitizeExtractedString(raw, 20000).text;
}
