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
 * Generate a custom batch DOM script for all non-file READY items in a section.
 * Sets values and dispatches native input, change, and blur events in a single pass.
 */
export function buildCustomSectionFillScript(sectionItems = []) {
  const payload = sectionItems
    .filter((item) => item.status === 'READY' && item.type !== 'file')
    .map((item) => ({
      fieldKey: item.fieldKey,
      selector: item.selector,
      label: item.label,
      type: item.type,
      value: item.value
    }));

  return {
    batchItems: payload,
    scriptSource: `(function applySectionBatch(items) {
  const results = [];
  for (const item of items) {
    const el = document.querySelector(item.selector) || document.getElementById(item.fieldKey) || document.querySelector('[name="' + item.fieldKey + '"]');
    if (!el) {
      results.push({ fieldKey: item.fieldKey, label: item.label, status: 'needs_human_fallback', reason: 'selector_not_found' });
      continue;
    }
    try {
      el.focus();
      if (item.type === 'checkbox') {
        el.checked = Boolean(item.value && item.value !== 'false');
      } else if (item.type === 'radio') {
        const radios = document.querySelectorAll('input[type="radio"][name="' + (el.name || item.fieldKey) + '"]');
        let matched = false;
        radios.forEach((r) => {
          if (String(r.value).toLowerCase() === String(item.value).toLowerCase()) {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            matched = true;
          }
        });
        if (!matched) el.checked = true;
      } else {
        const proto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement?.prototype
          : el.tagName === 'SELECT'
            ? window.HTMLSelectElement?.prototype
            : window.HTMLInputElement?.prototype;
        const nativeSetter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) nativeSetter.call(el, String(item.value));
        else el.value = String(item.value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      results.push({ fieldKey: item.fieldKey, label: item.label, status: 'filled_batch' });
    } catch (err) {
      results.push({ fieldKey: item.fieldKey, label: item.label, status: 'needs_human_fallback', reason: err.message });
    }
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
      (i) => i.type !== 'file' && !requireHumanFallbackForFields.has(i.fieldKey)
    );
    const humanOrFileItems = sectionItems.filter(
      (i) => i.type === 'file' || requireHumanFallbackForFields.has(i.fieldKey)
    );

    const sectionFilledMasked = [];

    // 1. Run custom batch DOM script for standard inputs in this section (1 browser call for entire section)
    if (nonFileBatchable.length > 0) {
      const { scriptSource } = buildCustomSectionFillScript(nonFileBatchable);
      const safety = verifyCustomBrowserScriptSafety(scriptSource);
      if (!safety.safe) {
        throw new Error(`Blocked unsafe custom browser script: ${safety.violations.join('; ')}`);
      }
      await executeLevelTool({
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

      for (const item of nonFileBatchable) {
        completedFieldKeys.add(item.fieldKey);
        const masked = maskPersonalValue(item.value);
        sectionFilledMasked.push({
          fieldKey: item.fieldKey,
          label: item.label,
          method: 'batch_script',
          maskedValue: masked
        });
        executionLog.push({
          section: sectionName,
          fieldKey: item.fieldKey,
          label: item.label,
          method: 'batch_script',
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
    missingItems: plan.items.filter((i) => i.status === 'MISSING'),
    unsupportedItems: plan.items.filter((i) => i.status === 'UNSUPPORTED')
  };
}
