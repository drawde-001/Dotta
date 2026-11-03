/**
 * executor.js
 *
 * Level 1 Custom Code Executor (code, not a model).
 * Executes the validated Fill Plan inside the Level 1 Browser Sandbox:
 * - Groups READY items by section
 * - Generates and executes a custom batch DOM script per section (0 model calls per field)
 * - Falls back to human-like Playwright actions (focus -> type -> blur / select / upload)
 *   for file uploads or anti-bot / custom widget fields
 * - Re-reads the DOM without reloading after each section
 * - Streams masked progress events (never raw personal values)
 * - Saves section-level checkpoints so partial progress is preserved on interrupt/pause
 */

import { validateFillPlan } from './schema.js';
import { maskPersonalValue } from './plan-file.js';
import { executeLevelTool } from './registries.js';
import { streamModelTurn } from '../models/model-adapter.js';

export const EXECUTOR_CODEGEN_SYSTEM_PROMPT = `You are the Level 1 Browser Subagent Custom DOM Code Generator.
Write a self-contained JavaScript IIFE that populates the provided section fields in the live DOM and dispatches input/change/blur events.
CRITICAL SECURITY RULES:
- NEVER call fetch, XMLHttpRequest, WebSocket, sendBeacon, window.open, eval, Function, or modify window.location.
- NEVER read document.cookie, localStorage, sessionStorage, or indexedDB.
- Return ONLY the executable JavaScript IIFE string.`;

const FORBIDDEN_BROWSER_SCRIPT_APIS = [
  /\bfetch\s*\(/i,
  /\bXMLHttpRequest\b/i,
  /\bsendBeacon\s*\(/i,
  /\bWebSocket\s*\(/i,
  /\bEventSource\s*\(/i,
  /\bwindow\.open\s*\(/i,
  /\b(?:window\.|document\.)?location\s*(?:\.href|\.assign|\.replace|=)/i,
  /\bdocument\.cookie\b/i,
  /\b(?:localStorage|sessionStorage|indexedDB)\b/i,
  /\b(?:eval|Function)\s*\(/i,
  /\bcreateElement\s*\(\s*['"](?:script|iframe|img|link|object|embed)['"]\s*\)/i
];

/**
 * Static safety verifier for custom page-specific execution code written by the
 * Level 1 Browser Subagent before running it inside the isolated RunSandbox.
 * Guarantees that custom scripts can only interact with the page DOM and can never
 * exfiltrate data, read cookies/storage, or navigate away.
 */
export function verifyCustomBrowserScriptSafety(scriptSource = '') {
  const src = String(scriptSource || '');
  const violations = [];
  for (const rx of FORBIDDEN_BROWSER_SCRIPT_APIS) {
    if (rx.test(src)) {
      violations.push(`Forbidden browser API pattern: ${rx.source}`);
    }
  }
  return {
    safe: violations.length === 0,
    violations
  };
}

/**
 * Synthesize custom DOM code for a section using the Level 1 Browser Subagent model
 * when `useLiveModel` or `mockCodegenCall` is provided, verifying it through
 * `verifyCustomBrowserScriptSafety` and falling back to `buildCustomSectionFillScript`
 * if offline or unsafe.
 */
export async function synthesizeCustomSectionScriptWithModel(
  sectionItems = [],
  { model = 'muse-spark-open', mockCodegenCall = null, useLiveModel = false } = {}
) {
  const fallback = buildCustomSectionFillScript(sectionItems);
  if (!useLiveModel && typeof mockCodegenCall !== 'function') {
    return fallback;
  }
  try {
    const prompt = JSON.stringify(
      sectionItems.map((i) => ({
        fieldKey: i.fieldKey,
        selector: i.selector,
        type: i.type,
        validationHints: i.validationHints || '',
        value: i.value
      }))
    );
    let candidateScript = '';
    if (typeof mockCodegenCall === 'function') {
      candidateScript = await mockCodegenCall({ prompt, model, systemInstruction: EXECUTOR_CODEGEN_SYSTEM_PROMPT });
    } else {
      const turn = await streamModelTurn({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: EXECUTOR_CODEGEN_SYSTEM_PROMPT,
        model,
        tools: []
      });
      candidateScript = turn?.text || '';
    }
    const cleaned = String(candidateScript || '')
      .trim()
      .replace(/^```(?:javascript|js)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    if (cleaned && verifyCustomBrowserScriptSafety(cleaned).safe) {
      return {
        batchItems: fallback.batchItems,
        scriptSource: cleaned,
        generatedByModel: true
      };
    }
  } catch {}
  return fallback;
}

/**
 * Generate a custom batch DOM script for all non-file READY items in a section.
 * Handles both standard HTML controls (<input>, <select>, <textarea>) AND modern custom ARIA
 * widgets ([role="combobox"], [role="listbox"], [role="textbox"], [contenteditable="true"],
 * [role="checkbox"], [role="switch"]) in a single pass.
 */
export function buildCustomSectionFillScript(sectionItems = []) {
  const payload = sectionItems
    .filter((item) => item.status === 'READY' && item.type !== 'file')
    .map((item) => ({
      fieldKey: item.fieldKey,
      selector: item.selector,
      label: item.label,
      type: item.type,
      validationHints: item.validationHints || '',
      value: item.value
    }));

  return {
    batchItems: payload,
    scriptSource: `(function applySectionBatch(items) {
  const results = [];
  for (const item of items) {
    const el = document.querySelector(item.selector) || document.getElementById(item.fieldKey) || document.querySelector('[name="' + item.fieldKey + '"]') || document.querySelector('[data-testid="' + item.fieldKey + '"]');
    if (!el) {
      results.push({ fieldKey: item.fieldKey, label: item.label, status: 'needs_human_fallback', reason: 'selector_not_found' });
      continue;
    }
    try {
      el.focus();
      const role = (el.getAttribute('role') || '').toLowerCase();
      const isContentEditable = el.getAttribute('contenteditable') === 'true';
      const tag = (el.tagName || '').toUpperCase();

      if (role === 'combobox' || role === 'listbox') {
        el.click();
        el.dataset.value = String(item.value);
        el.setAttribute('aria-valuetext', String(item.value));
        const valNorm = String(item.value).trim().toLowerCase();
        const optCandidates = Array.from(el.querySelectorAll('[role="option"], li, option')).concat(
          Array.from(document.querySelectorAll('[role="listbox"] [role="option"], [role="menu"] [role="menuitem"]'))
        );
        const matchOpt = optCandidates.find((o) => {
          const t = (o.textContent || o.getAttribute('data-value') || '').trim().toLowerCase();
          return t === valNorm || t.includes(valNorm) || valNorm.includes(t);
        });
        if (matchOpt) {
          matchOpt.click();
          matchOpt.setAttribute('aria-selected', 'true');
        }
      } else if (role === 'checkbox' || role === 'switch') {
        const wantChecked = Boolean(item.value && item.value !== 'false' && item.value !== '0');
        const curChecked = el.getAttribute('aria-checked') === 'true';
        if (curChecked !== wantChecked) el.click();
        el.setAttribute('aria-checked', wantChecked ? 'true' : 'false');
        el.dataset.value = wantChecked ? 'true' : 'false';
      } else if (isContentEditable || (role === 'textbox' && tag !== 'INPUT' && tag !== 'TEXTAREA')) {
        el.textContent = String(item.value);
        el.dataset.value = String(item.value);
      } else if (item.type === 'checkbox') {
        el.checked = Boolean(item.value && item.value !== 'false');
      } else if (item.type === 'radio') {
        const radios = document.querySelectorAll('input[type="radio"][name="' + (el.name || item.fieldKey) + '"]');
        let matched = false;
        const itemVal = String(item.value || '').trim().toLowerCase();
        radios.forEach((r) => {
          const rVal = String(r.value || '').trim().toLowerCase();
          if (
            rVal === itemVal ||
            (itemVal.startsWith('f') && rVal === 'f') ||
            (itemVal.startsWith('m') && rVal === 'm')
          ) {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            matched = true;
          }
        });
        if (!matched) el.checked = true;
      } else if (tag === 'SELECT') {
        const valStr = String(item.value || '').trim().toLowerCase();
        let matched = false;

        // Candidate match values (e.g. Month numbers vs Month names, State codes vs State names)
        const candidates = new Set([valStr]);
        const numVal = parseInt(valStr, 10);
        const MONTH_MAP = {
          1: ['january', 'jan', '01', '1'],
          2: ['february', 'feb', '02', '2'],
          3: ['march', 'mar', '03', '3'],
          4: ['april', 'apr', '04', '4'],
          5: ['may', '05', '5'],
          6: ['june', 'jun', '06', '6'],
          7: ['july', 'jul', '07', '7'],
          8: ['august', 'aug', '08', '8'],
          9: ['september', 'sep', '09', '9'],
          10: ['october', 'oct', '10'],
          11: ['november', 'nov', '11'],
          12: ['december', 'dec', '12']
        };
        for (const [mNum, names] of Object.entries(MONTH_MAP)) {
          if (names.includes(valStr) || parseInt(mNum, 10) === numVal) {
            names.forEach((n) => candidates.add(n));
          }
        }

        const STATE_MAP = {
          al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
          co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia',
          hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
          ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
          ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
          mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey',
          nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio',
          ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
          sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
          va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
          dc: 'district of columbia'
        };
        if (STATE_MAP[valStr]) candidates.add(STATE_MAP[valStr]);
        for (const [code, fullName] of Object.entries(STATE_MAP)) {
          if (fullName === valStr) {
            candidates.add(code);
            candidates.add(fullName);
          }
        }

        // Pass 1: Match against candidates on value or text
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          const oVal = (opt.value || '').trim().toLowerCase();
          const oText = (opt.text || '').trim().toLowerCase();
          for (const c of candidates) {
            if (c && (oVal === c || oText === c)) {
              el.selectedIndex = i;
              matched = true;
              break;
            }
          }
          if (matched) break;
        }

        // Pass 2: Substring or prefix match (skipping empty placeholder options like "Select...")
        if (!matched) {
          for (let i = 0; i < el.options.length; i++) {
            const opt = el.options[i];
            const oVal = (opt.value || '').trim().toLowerCase();
            const oText = (opt.text || '').trim().toLowerCase();
            if (!oVal && !oText) continue;
            if (/^(select|choose|--|\s*)$/i.test(oText) || /^(select|choose|--|\s*)$/i.test(oVal)) continue;

            for (const c of candidates) {
              if (c && c.length >= 2 && (oVal.includes(c) || oText.includes(c) || c.includes(oVal) || c.includes(oText))) {
                el.selectedIndex = i;
                matched = true;
                break;
              }
            }
            if (matched) break;
          }
        }

        // Pass 3: If select is required/location and still on placeholder, pick closest or first valid option
        if (!matched && el.options.length > 1) {
          const firstNonPlaceholder = Array.from(el.options).findIndex(
            (o) => o.value && !/^(select|choose|--|\s*)$/i.test(o.text)
          );
          if (firstNonPlaceholder !== -1 && (item.label.toLowerCase().includes('office') || item.label.toLowerCase().includes('location') || item.label.toLowerCase().includes('branch'))) {
            el.selectedIndex = firstNonPlaceholder;
            matched = true;
          }
        }

        if (!matched) {
          const proto = window.HTMLSelectElement?.prototype;
          const nativeSetter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (nativeSetter) nativeSetter.call(el, String(item.value));
          else el.value = String(item.value);
        }
      } else {
        const proto = tag === 'TEXTAREA'
          ? window.HTMLTextAreaElement?.prototype
          : window.HTMLInputElement?.prototype;
        const nativeSetter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        // Auto-distribute split phone inputs (e.g. 3 inputs: area [3], prefix [3], line [4])
        const isPhoneField = item.fieldKey.toLowerCase().includes('phone') || item.label.toLowerCase().includes('phone');
        const digits = String(item.value).replace(/\D+/g, '');
        const tenDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

        if (tag === 'INPUT' && isPhoneField && tenDigits.length === 10) {
          const container = el.closest('.form-group, .form-row, .field, div, tr') || el.parentElement;
          const phoneSiblings = container
            ? Array.from(container.querySelectorAll('input[type="text"], input[type="tel"], input:not([type])')).filter((i) => {
                const r = i.getBoundingClientRect();
                return r.width > 0 && i.type !== 'hidden';
              })
            : [];
          if (phoneSiblings.length === 3) {
            const parts = [tenDigits.slice(0, 3), tenDigits.slice(3, 6), tenDigits.slice(6, 10)];
            phoneSiblings.forEach((inp, pIdx) => {
              if (nativeSetter) nativeSetter.call(inp, parts[pIdx]);
              else inp.value = parts[pIdx];
              try {
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                inp.dispatchEvent(new Event('blur', { bubbles: true }));
              } catch {}
            });
          } else {
            if (nativeSetter) nativeSetter.call(el, String(item.value));
            else el.value = String(item.value);
          }
        } else {
          if (nativeSetter) nativeSetter.call(el, String(item.value));
          else el.value = String(item.value);
        }
      }
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        if (typeof window.jQuery === 'function') {
          try {
            window.jQuery(el).trigger('input').trigger('change').trigger('blur');
          } catch {}
        }
      } catch {}

      // Inspect DOM validation state immediately after filling
      let isValid = true;
      let errorReason = null;
      try {
        if (typeof el.checkValidity === 'function' && !el.checkValidity()) {
          isValid = false;
          errorReason = el.validationMessage || 'HTML5 checkValidity failed';
        }
        const container = el.closest('.form-group, .form-row, .field, div') || el.parentElement;
        if (container) {
          const hasErrClass = container.classList.contains('has-error') ||
                              container.classList.contains('is-invalid') ||
                              container.classList.contains('error');
          if (hasErrClass) {
            isValid = false;
            errorReason = 'Container marked with validation error (.has-error/.is-invalid)';
          }
          const errEl = container.querySelector('.help-block, .invalid-feedback, .error-message, .text-danger, [role="alert"]');
          if (errEl && (errEl.innerText || '').trim()) {
            isValid = false;
            errorReason = (errEl.innerText || '').trim();
          }
        }
        if (el.getAttribute('aria-invalid') === 'true') {
          isValid = false;
          errorReason = 'aria-invalid="true"';
        }
        const cs = window.getComputedStyle(el);
        const bc = cs.borderColor || '';
        const m = bc.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (m) {
          const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
          if (r > 170 && g < 90 && b < 90) {
            isValid = false;
            errorReason = 'Input border highlighted red';
          }
        }
      } catch {}

      if (!isValid) {
        results.push({ fieldKey: item.fieldKey, label: item.label, status: 'needs_human_fallback', reason: errorReason || 'DOM validation error' });
      } else {
        results.push({ fieldKey: item.fieldKey, label: item.label, status: 'filled_batch', verifiedValid: true });
      }
    } catch (err) {
      results.push({ fieldKey: item.fieldKey, label: item.label, status: 'needs_human_fallback', reason: err.message });
    }
  }
  return results;
})(${JSON.stringify(payload)});`
  };
}

/**
 * Generate a custom DOM script for verified interactive web-task actions (clicks on filters,
 * tabs, directory cards, or action buttons).
 */
export function buildCustomWebTaskScript(webTaskActions = []) {
  const payload = (webTaskActions || []).map((act) => ({
    elementKey: act.elementKey,
    action: act.action || 'click',
    label: act.label,
    selector: act.selector
  }));

  return {
    actions: payload,
    scriptSource: `(function applyWebTaskActions(actions) {
  const results = [];
  for (const act of actions) {
    let el = document.querySelector(act.selector) || document.getElementById(act.elementKey);
    if (!el) {
      const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], a, [role="button"], [role="tab"]'));
      el = candidates.find((c) => ((c.textContent || c.value || '').trim().toLowerCase() === String(act.label || '').trim().toLowerCase()));
    }
    if (!el) {
      results.push({ elementKey: act.elementKey, label: act.label, status: 'not_found' });
      continue;
    }
    el.click();
    results.push({ elementKey: act.elementKey, label: act.label, status: 'clicked' });
  }
  return results;
})(${JSON.stringify(payload)});`
  };
}

/**
 * Execute a validated Fill Plan inside the Level 1 sandbox.
 * Zero model calls are made during execution.
 */
export async function runCustomPlanExecutor({
  fillPlan,
  expectedProfileId = null,
  browserExecutor = null,
  previousCheckpoint = null,
  requireHumanFallbackForFields = new Set(),
  executionStrategy = 'adaptive',
  onProgress = null
} = {}) {
  const validation = validateFillPlan(fillPlan, { expectedProfileId });
  if (!validation.valid) {
    return {
      ok: false,
      dropped: true,
      errors: validation.errors
    };
  }

  const plan = validation.data;
  const completedFieldKeys = new Set(previousCheckpoint?.completedFieldKeys || []);
  const readyItems = plan.items.filter(
    (item) => item.status === 'READY' && !completedFieldKeys.has(item.fieldKey)
  );

  // Group items by section while preserving order
  const sectionsMap = new Map();
  for (const item of readyItems) {
    const sec = item.section || 'General';
    if (!sectionsMap.has(sec)) sectionsMap.set(sec, []);
    sectionsMap.get(sec).push(item);
  }

  const sectionCheckpoints = [...(previousCheckpoint?.sectionCheckpoints || [])];
  const executionLog = [];
  let modelCallsUsed = 0; // Executor is custom code: always 0 model calls!
  let batchScriptRuns = 0;
  let humanFallbackRuns = 0;
  let snapshotReReads = 0;

  const defaultBrowserExec = async (toolName, toolArgs) => {
    if (typeof browserExecutor === 'function') {
      return await browserExecutor(toolName, toolArgs);
    }
    return { ok: true, toolName, toolArgs };
  };

  for (const [sectionName, sectionItems] of sectionsMap.entries()) {
    const nonFileBatchable = sectionItems.filter(
      (i) => executionStrategy !== 'browser_action' && i.type !== 'file' && !requireHumanFallbackForFields.has(i.fieldKey)
    );
    const humanOrFileItems = sectionItems.filter(
      (i) => executionStrategy === 'browser_action' || i.type === 'file' || requireHumanFallbackForFields.has(i.fieldKey)
    );

    const sectionFilledMasked = [];

    // 1. Run custom batch DOM script for standard inputs in this section (1 browser call for entire section)
    if (nonFileBatchable.length > 0) {
      const { scriptSource } = buildCustomSectionFillScript(nonFileBatchable);
      const safety = verifyCustomBrowserScriptSafety(scriptSource);
      if (!safety.safe) {
        throw new Error(`Blocked unsafe custom browser script: ${safety.violations.join('; ')}`);
      }
      const batchResultRaw = await executeLevelTool({
        level: 'browser_subagent',
        toolName: 'browser_action',
        toolArgs: {
          action: 'batch_fill_section',
          section: sectionName,
          script: scriptSource,
          fields: nonFileBatchable.map((i) => ({
            fieldKey: i.fieldKey,
            selector: i.selector,
            type: i.type,
            value: i.value
          }))
        },
        context: {},
        executor: defaultBrowserExec
      });
      batchScriptRuns++;

      let evalList = [];
      try {
        const rawObj = typeof batchResultRaw === 'string' ? JSON.parse(batchResultRaw) : batchResultRaw;
        if (Array.isArray(rawObj)) evalList = rawObj;
        else if (Array.isArray(rawObj?.evalRes)) evalList = rawObj.evalRes;
        else if (Array.isArray(rawObj?.res)) evalList = rawObj.res;
      } catch {}

      const evalMap = new Map();
      for (const res of evalList) {
        if (res?.fieldKey) evalMap.set(res.fieldKey, res);
      }

      for (const item of nonFileBatchable) {
        const evalItem = evalMap.get(item.fieldKey);
        const needsFallback = evalItem && evalItem.status === 'needs_human_fallback';

        if (needsFallback) {
          humanFallbackRuns++;
          const actType = item.type === 'select' ? 'select' : item.type === 'radio' || item.type === 'checkbox' ? 'click' : 'type';
          await executeLevelTool({
            level: 'browser_subagent',
            toolName: 'browser_action',
            toolArgs: {
              action: actType,
              selector: item.selector,
              value: String(item.value),
              humanLike: true
            },
            context: {},
            executor: defaultBrowserExec
          });
        }

        completedFieldKeys.add(item.fieldKey);
        const masked = maskPersonalValue(item.value);
        sectionFilledMasked.push({
          fieldKey: item.fieldKey,
          label: item.label,
          method: needsFallback ? 'human_adaptive_fallback' : 'batch_script',
          maskedValue: masked
        });
        executionLog.push({
          section: sectionName,
          fieldKey: item.fieldKey,
          label: item.label,
          method: needsFallback ? 'human_adaptive_fallback' : 'batch_script',
          maskedValue: masked,
          status: 'filled'
        });
      }
    }

    // 2. Human-like Playwright fallback for file uploads or anti-bot / custom widget fields
    for (const item of humanOrFileItems) {
      const actionType =
        item.type === 'file'
          ? 'upload'
          : item.type === 'select'
            ? 'select'
            : item.type === 'checkbox' || item.type === 'radio'
              ? 'click'
              : 'type';

      await executeLevelTool({
        level: 'browser_subagent',
        toolName: 'browser_action',
        toolArgs: {
          action: actionType,
          selector: item.selector,
          value: String(item.value),
          humanLike: true
        },
        context: {},
        executor: defaultBrowserExec
      });
      humanFallbackRuns++;
      completedFieldKeys.add(item.fieldKey);

      const masked = maskPersonalValue(item.value);
      sectionFilledMasked.push({
        fieldKey: item.fieldKey,
        label: item.label,
        method: actionType === 'upload' ? 'file_upload' : 'human_fallback',
        maskedValue: masked
      });
      executionLog.push({
        section: sectionName,
        fieldKey: item.fieldKey,
        label: item.label,
        method: actionType === 'upload' ? 'file_upload' : 'human_fallback',
        maskedValue: masked,
        status: 'filled'
      });
    }

    // 3. Re-read the live DOM without reloading to check for newly revealed fields or validation errors
    const reReadResult = await executeLevelTool({
      level: 'browser_subagent',
      toolName: 'snapshot_read',
      toolArgs: { section: sectionName, noReload: true },
      context: {},
      executor: defaultBrowserExec
    });
    snapshotReReads++;

    const checkpointEntry = {
      section: sectionName,
      completedAt: Date.now(),
      filledCount: sectionFilledMasked.length,
      fields: sectionFilledMasked,
      reReadStatus: reReadResult?.status || 'ok'
    };
    sectionCheckpoints.push(checkpointEntry);

    if (typeof onProgress === 'function') {
      onProgress({
        type: 'FORM_SECTION_PROGRESS',
        section: sectionName,
        filledFields: sectionFilledMasked,
        completedCount: completedFieldKeys.size,
        totalReadyCount: plan.items.filter((i) => i.status === 'READY').length,
        timestamp: Date.now()
      });
    }
  }

  // 4. Execute any verified interactive web-task actions (clicks on filters, tabs, directory results, or buttons)
  const executedWebActions = [];
  if (Array.isArray(plan.webTaskActions) && plan.webTaskActions.length > 0) {
    const { scriptSource } = buildCustomWebTaskScript(plan.webTaskActions);
    const safety = verifyCustomBrowserScriptSafety(scriptSource);
    if (!safety.safe) {
      throw new Error(`Blocked unsafe custom web-task script: ${safety.violations.join('; ')}`);
    }
    await executeLevelTool({
      level: 'browser_subagent',
      toolName: 'browser_action',
      toolArgs: {
        action: 'batch_fill_section',
        section: 'Web Task Actions',
        script: scriptSource,
        actions: plan.webTaskActions
      },
      context: {},
      executor: defaultBrowserExec
    });
    for (const act of plan.webTaskActions) {
      executedWebActions.push({
        elementKey: act.elementKey,
        action: act.action || 'click',
        label: act.label,
        selector: act.selector,
        status: 'executed'
      });
    }
    if (typeof onProgress === 'function') {
      onProgress({
        type: 'WEB_TASK_ACTIONS_PROGRESS',
        actions: executedWebActions,
        timestamp: Date.now()
      });
    }
  }

  return {
    ok: true,
    dropped: false,
    modelCallsUsed,
    batchScriptRuns,
    humanFallbackRuns,
    snapshotReReads,
    completedFieldKeys: [...completedFieldKeys],
    sectionCheckpoints,
    executionLog,
    executedWebActions,
    missingItems: plan.items.filter((i) => i.status === 'MISSING'),
    unsupportedItems: plan.items.filter((i) => i.status === 'UNSUPPORTED')
  };
}

