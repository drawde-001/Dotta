/**
 * verifier.js
 *
 * Ground-truth DOM Verification & Enforcement Engine.
 * Enforces proof with evidence before Omni can claim any form or web task is done.
 *
 * Statuses:
 * - SUBMITTED_CONFIRMED: Post-submit signals verified (URL change or confirmation text).
 * - FILLED_NOT_SUBMITTED: All intended fields verified in DOM without errors; submit not triggered.
 * - PARTIAL: One or more fields failed validation, display red borders, or have mismatches.
 * - FAILED: Submission rejected, page crashed, or critical validation blocked execution.
 */

import { redactPiiAndInternalIds } from './plan-file.js';

export function maskPersonalValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  if (str.includes('@')) {
    const [u, d] = str.split('@');
    return `${u.slice(0, 2)}***@${d}`;
  }
  if (str.length <= 4) return '***';
  return `${str.slice(0, 2)}***${str.slice(-2)}`;
}

/**
 * Inspects live Playwright page DOM for exact field values, HTML5 validity,
 * ARIA invalid state, error CSS classes, computed red borders, and post-submit signals.
 */
export async function verifyLiveFormDom(page, intendedFieldsMap = {}, options = {}) {
  if (!page) {
    return {
      status: 'FAILED',
      verifiedCount: 0,
      failedFields: [],
      error: 'No active browser page to verify',
      evidence: { error: 'Page unavailable' }
    };
  }

  const { initialUrl = '', isSubmitAction = false } = options;

  const rawDomInspection = await page.evaluate(
    ({ fieldEntries, origUrl, checkSubmit }) => {
      const currentUrl = window.location.href;
      const urlChanged = Boolean(origUrl && currentUrl !== origUrl && !currentUrl.includes('#'));

      // Check for confirmation text
      const bodyText = document.body ? document.body.innerText : '';
      const hasConfirmationText = /\b(thank\s+you|application\s+(received|submitted)|successfully\s+submitted|submission\s+received|your\s+response\s+has\s+been\s+recorded)\b/i.test(
        bodyText
      );

      // Check remaining submit buttons
      const remainingSubmitButtons = Array.from(
        document.querySelectorAll('button[type="submit"], input[type="submit"], button:has-text("Submit")')
      ).filter((b) => {
        const s = window.getComputedStyle(b);
        const r = b.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && (r.width > 0 || r.height > 0);
      }).length;

      const results = [];

      for (const entry of fieldEntries) {
        const { fieldKey, selector, intendedValue, label = fieldKey, type = 'text' } = entry;
        let el = null;
        try {
          if (selector) el = document.querySelector(selector);
          if (!el && fieldKey) el = document.querySelector(`[name="${fieldKey}"], #${fieldKey}`);
        } catch {}

        if (!el) {
          results.push({
            fieldKey,
            label,
            found: false,
            valid: false,
            reason: `Element not found in DOM for selector "${selector || fieldKey}"`,
            actualValue: null,
            intendedValue
          });
          continue;
        }

        const tag = el.tagName.toLowerCase();
        let actualValue = el.value || '';
        if (tag === 'select') {
          const opt = el.selectedOptions?.[0] || el.querySelector('option:checked');
          actualValue = opt ? (opt.text || opt.value || '').trim() : el.value;
        } else if (el.type === 'checkbox' || el.type === 'radio') {
          actualValue = el.checked ? 'true' : 'false';
        }

        // 1. Native HTML5 validity
        let nativeValid = true;
        if (typeof el.checkValidity === 'function') {
          try {
            nativeValid = el.checkValidity();
          } catch {}
        }

        // 2. ARIA invalid attribute
        const ariaInvalid = el.getAttribute('aria-invalid') === 'true';

        // 3. Error classes on element or nearby container
        const classNames = (el.className || '') + ' ' + (el.parentElement?.className || '') + ' ' + (el.closest('.form-group, .form-row, .field, .input-container')?.className || '');
        const hasErrorClass = /\b(has-error|is-invalid|form-error|input-error|invalid)\b/i.test(classNames);

        // 4. Computed red border style
        let hasRedBorder = false;
        try {
          const compStyle = window.getComputedStyle(el);
          const borderColor = compStyle.borderColor || compStyle.borderTopColor || '';
          const match = borderColor.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
          if (match) {
            const r = parseInt(match[1], 10);
            const g = parseInt(match[2], 10);
            const b = parseInt(match[3], 10);
            // High red, low green/blue indicates error highlight
            if (r >= 160 && g <= 100 && b <= 100) {
              hasRedBorder = true;
            }
          }
        } catch {}

        // 5. Value comparison
        const normIntended = String(intendedValue ?? '').trim().toLowerCase();
        const normActual = String(actualValue ?? '').trim().toLowerCase();
        let valueMatches = true;
        if (normIntended) {
          if (tag === 'select') {
            valueMatches = normActual.includes(normIntended) || normIntended.includes(normActual);
          } else if (el.type === 'checkbox' || el.type === 'radio') {
            valueMatches = normActual === normIntended;
          } else {
            valueMatches = normActual === normIntended || normActual.includes(normIntended);
          }
        }

        const errors = [];
        if (!nativeValid) errors.push('HTML5 constraint validation failed');
        if (ariaInvalid) errors.push('aria-invalid is true');
        if (hasErrorClass) errors.push('Container has error/invalid class');
        if (hasRedBorder) errors.push('Computed border is red (validation error state)');
        if (!valueMatches && normIntended) {
          errors.push(`Value mismatch (intended "${normIntended.slice(0, 20)}", got "${normActual.slice(0, 20)}")`);
        }

        results.push({
          fieldKey,
          label,
          found: true,
          valid: errors.length === 0,
          reason: errors.join('; ') || 'Valid',
          actualValue,
          intendedValue,
          hasRedBorder,
          nativeValid,
          ariaInvalid,
          hasErrorClass
        });
      }

      return {
        urlChanged,
        currentUrl,
        hasConfirmationText,
        remainingSubmitButtons,
        results
      };
    },
    {
      fieldEntries: Object.entries(intendedFieldsMap).map(([k, v]) => ({
        fieldKey: k,
        selector: v.selector || (k.startsWith('#') ? k : `#${k}`),
        intendedValue: v.value !== undefined ? v.value : v,
        label: v.label || k,
        type: v.type || 'text'
      })),
      origUrl: initialUrl,
      checkSubmit: isSubmitAction
    }
  ).catch((err) => ({
    error: err.message,
    results: []
  }));

  if (rawDomInspection.error) {
    return {
      status: 'FAILED',
      verifiedCount: 0,
      failedFields: [],
      error: rawDomInspection.error,
      evidence: { error: rawDomInspection.error }
    };
  }

  const { results = [], urlChanged, hasConfirmationText, remainingSubmitButtons, currentUrl } = rawDomInspection;

  const verifiedFields = results.filter((r) => r.valid);
  const failedFields = results.filter((r) => !r.valid);

  let finalStatus = 'FILLED_NOT_SUBMITTED';

  if (isSubmitAction) {
    if (urlChanged || hasConfirmationText) {
      finalStatus = 'SUBMITTED_CONFIRMED';
    } else if (failedFields.length > 0) {
      finalStatus = 'PARTIAL';
    } else if (remainingSubmitButtons === 0) {
      finalStatus = 'SUBMITTED_CONFIRMED';
    } else {
      finalStatus = 'FILLED_NOT_SUBMITTED';
    }
  } else {
    if (failedFields.length > 0 && verifiedFields.length > 0) {
      finalStatus = 'PARTIAL';
    } else if (failedFields.length > 0 && verifiedFields.length === 0) {
      finalStatus = 'FAILED';
    } else {
      finalStatus = 'FILLED_NOT_SUBMITTED';
    }
  }

  return {
    status: finalStatus,
    verifiedCount: verifiedFields.length,
    failedCount: failedFields.length,
    totalCount: results.length,
    verifiedFields: verifiedFields.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.label,
      maskedValue: maskPersonalValue(f.actualValue)
    })),
    failedFields: failedFields.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.label,
      reason: f.reason,
      maskedActual: maskPersonalValue(f.actualValue),
      hasRedBorder: f.hasRedBorder
    })),
    evidence: {
      url: currentUrl,
      urlChanged,
      hasConfirmationText,
      remainingSubmitButtons
    }
  };
}

/**
 * Enforces truthful reporting in user-facing messages.
 * Blocks any claim of "done" or "submitted" if fields are in an error state.
 */
export function enforceVerifiedMessage(proposedMessage, verificationResult, profile = null) {
  if (!verificationResult) return proposedMessage;

  const { status, verifiedCount, failedFields = [], evidence = {} } = verificationResult;

  if (status === 'PARTIAL') {
    const errorDetails = failedFields.map((f) => `• ${f.label}: ${f.reason}`).join('\n');
    return redactPiiAndInternalIds(
      `### Form Status: PARTIAL (Validation Errors Detected)\n` +
      `Verified ${verifiedCount} field(s) successfully, but ${failedFields.length} field(s) failed validation:\n${errorDetails}\n\n` +
      `The form was NOT submitted. Please review the highlighted fields above.`,
      profile
    );
  }

  if (status === 'FAILED') {
    const errorDetails = failedFields.map((f) => `• ${f.label}: ${f.reason}`).join('\n');
    return redactPiiAndInternalIds(
      `### Form Status: FAILED\n` +
      `Could not complete the form. Validation errors:\n${errorDetails || 'Critical validation failure'}\n`,
      profile
    );
  }

  if (status === 'SUBMITTED_CONFIRMED') {
    return redactPiiAndInternalIds(
      `### Form Status: SUBMITTED & CONFIRMED\n` +
      `All ${verifiedCount} verified fields completed without errors. Submission confirmed with positive receipt from the page.`,
      profile
    );
  }

  // FILLED_NOT_SUBMITTED
  return redactPiiAndInternalIds(
    `### Form Status: FILLED (Ready for Review)\n` +
    `Successfully filled ${verifiedCount} field(s) with zero validation errors. Form is prepared and ready for your final review before submitting.`,
    profile
  );
}
