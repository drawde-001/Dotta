/**
 * Phase 3 Verification Test Suite: Verify Before Claiming (Truthful Reporting)
 *
 * Proves:
 * 1. Correctly identifies FILLED_NOT_SUBMITTED when all DOM fields pass validation.
 * 2. Detects PARTIAL with exact field-level reasons when fields fail checkValidity,
 *    have aria-invalid="true", .has-error classes, or red computed borders rgb(r>170, g<90, b<90).
 * 3. Enforces truthful messaging in code: blocks any false "done" or "submitted" claim
 *    when fields are in an error state.
 * 4. Correctly verifies SUBMITTED_CONFIRMED when post-submit signals (URL change or confirmation text) are present.
 * 5. Masks sensitive personal values in verification evidence and user-facing messages.
 */

import assert from 'assert';
import { verifyLiveFormDom, enforceVerifiedMessage } from '../src/core/levels/verifier.js';

console.log('=== PHASE 3: VERIFY BEFORE CLAIMING (TRUTHFUL REPORTING) VERIFICATION ===\n');

// Mock Playwright Page for verification scenarios
function createMockVerificationPage(scenario = 'clean') {
  return {
    evaluate: async (fn, args) => {
      const { fieldEntries, origUrl, checkSubmit } = args;

      if (scenario === 'clean') {
        return {
          urlChanged: false,
          currentUrl: origUrl || 'http://127.0.0.1:4000/form',
          hasConfirmationText: false,
          remainingSubmitButtons: 1,
          results: fieldEntries.map((f) => ({
            fieldKey: f.fieldKey,
            label: f.label,
            found: true,
            valid: true,
            reason: 'Valid',
            actualValue: f.intendedValue,
            intendedValue: f.intendedValue,
            hasRedBorder: false,
            nativeValid: true,
            ariaInvalid: false,
            hasErrorClass: false
          }))
        };
      }

      if (scenario === 'red_borders_and_invalid') {
        return {
          urlChanged: false,
          currentUrl: origUrl || 'http://127.0.0.1:4000/form',
          hasConfirmationText: false,
          remainingSubmitButtons: 1,
          results: fieldEntries.map((f, idx) => {
            // Field 0 & 1 valid, Field 2 has red border & invalid class, Field 3 has aria-invalid
            if (idx === 2) {
              return {
                fieldKey: f.fieldKey,
                label: f.label,
                found: true,
                valid: false,
                reason: 'HTML5 constraint validation failed; Computed border is red (validation error state)',
                actualValue: 'bad-phone',
                intendedValue: f.intendedValue,
                hasRedBorder: true,
                nativeValid: false,
                ariaInvalid: false,
                hasErrorClass: true
              };
            }
            if (idx === 3) {
              return {
                fieldKey: f.fieldKey,
                label: f.label,
                found: true,
                valid: false,
                reason: 'aria-invalid is true; Container has error/invalid class',
                actualValue: '',
                intendedValue: f.intendedValue,
                hasRedBorder: true,
                nativeValid: false,
                ariaInvalid: true,
                hasErrorClass: true
              };
            }
            return {
              fieldKey: f.fieldKey,
              label: f.label,
              found: true,
              valid: true,
              reason: 'Valid',
              actualValue: f.intendedValue,
              intendedValue: f.intendedValue,
              hasRedBorder: false,
              nativeValid: true,
              ariaInvalid: false,
              hasErrorClass: false
            };
          })
        };
      }

      if (scenario === 'submitted_confirmed') {
        return {
          urlChanged: true,
          currentUrl: 'http://127.0.0.1:4000/thank-you',
          hasConfirmationText: true,
          remainingSubmitButtons: 0,
          results: fieldEntries.map((f) => ({
            fieldKey: f.fieldKey,
            label: f.label,
            found: true,
            valid: true,
            reason: 'Valid',
            actualValue: f.intendedValue,
            intendedValue: f.intendedValue,
            hasRedBorder: false,
            nativeValid: true,
            ariaInvalid: false,
            hasErrorClass: false
          }))
        };
      }

      if (scenario === 'all_failed') {
        return {
          urlChanged: false,
          currentUrl: origUrl,
          hasConfirmationText: false,
          remainingSubmitButtons: 1,
          results: fieldEntries.map((f) => ({
            fieldKey: f.fieldKey,
            label: f.label,
            found: false,
            valid: false,
            reason: 'Element not found in DOM',
            actualValue: null,
            intendedValue: f.intendedValue
          }))
        };
      }

      throw new Error(`Unknown scenario: ${scenario}`);
    }
  };
}

async function runPhase3Tests() {
  const testFields = {
    fullName: { label: 'Full Name', value: 'Alex Morgan' },
    email: { label: 'Email Address', value: 'alex@example.com' },
    phone: { label: 'Phone Number', value: '+1 (555) 019-2834' },
    dob: { label: 'Date of Birth', value: '1990-05-15' }
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Clean Form -> FILLED_NOT_SUBMITTED
  // ---------------------------------------------------------------------------
  console.log('[Test 1] Testing clean form verification...');
  const pageClean = createMockVerificationPage('clean');
  const resClean = await verifyLiveFormDom(pageClean, testFields, {
    initialUrl: 'http://127.0.0.1:4000/form',
    isSubmitAction: false
  });

  console.log('  -> Status:', resClean.status);
  console.log('  -> Verified count:', resClean.verifiedCount, 'Failed count:', resClean.failedCount);
  assert.strictEqual(resClean.status, 'FILLED_NOT_SUBMITTED');
  assert.strictEqual(resClean.verifiedCount, 4);
  assert.strictEqual(resClean.failedCount, 0);

  const cleanMsg = enforceVerifiedMessage('Completed all fields', resClean);
  assert(cleanMsg.includes('FILLED (Ready for Review)'), 'Clean message must indicate ready for review');
  console.log('✓ Test 1 PASSED: FILLED_NOT_SUBMITTED verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Red Borders & Validation Errors -> PARTIAL (Never Lie)
  // ---------------------------------------------------------------------------
  console.log('[Test 2] Testing form with red borders and validation errors...');
  const pageErrors = createMockVerificationPage('red_borders_and_invalid');
  const resErrors = await verifyLiveFormDom(pageErrors, testFields, {
    initialUrl: 'http://127.0.0.1:4000/form',
    isSubmitAction: false
  });

  console.log('  -> Status:', resErrors.status);
  console.log('  -> Failed fields count:', resErrors.failedFields.length);
  console.log('  -> Failure details:', resErrors.failedFields);

  assert.strictEqual(resErrors.status, 'PARTIAL');
  assert.strictEqual(resErrors.verifiedCount, 2);
  assert.strictEqual(resErrors.failedCount, 2);
  assert(resErrors.failedFields.some((f) => f.hasRedBorder), 'Must detect red border error state');

  // Enforce truthful reporting: agent cannot say it is done
  const deceptiveMessage = 'Completed 4 verified field(s) across 1 section(s). Submitted application.';
  const enforcedMsg = enforceVerifiedMessage(deceptiveMessage, resErrors);
  console.log('  -> Enforced Truthful Message:\n' + enforcedMsg);

  assert(enforcedMsg.includes('PARTIAL (Validation Errors Detected)'), 'Must enforce PARTIAL status in message');
  assert(enforcedMsg.includes('The form was NOT submitted'), 'Must explicitly state form was NOT submitted');
  assert(enforcedMsg.includes('Phone Number:'), 'Must list failing Phone field');
  assert(enforcedMsg.includes('Date of Birth:'), 'Must list failing DOB field');
  assert(!enforcedMsg.includes('Alex Morgan'), 'Must not leak raw personal info');
  console.log('✓ Test 2 PASSED: Red border detection and truthful PARTIAL enforcement verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Post-Submit Signals -> SUBMITTED_CONFIRMED
  // ---------------------------------------------------------------------------
  console.log('[Test 3] Testing post-submit signals...');
  const pageSubmitted = createMockVerificationPage('submitted_confirmed');
  const resSubmitted = await verifyLiveFormDom(pageSubmitted, testFields, {
    initialUrl: 'http://127.0.0.1:4000/form',
    isSubmitAction: true
  });

  console.log('  -> Status:', resSubmitted.status);
  console.log('  -> URL changed:', resSubmitted.evidence.urlChanged);
  console.log('  -> Has confirmation text:', resSubmitted.evidence.hasConfirmationText);

  assert.strictEqual(resSubmitted.status, 'SUBMITTED_CONFIRMED');
  const submittedMsg = enforceVerifiedMessage('Done', resSubmitted);
  assert(submittedMsg.includes('SUBMITTED & CONFIRMED'), 'Message must indicate confirmed submission');
  console.log('✓ Test 3 PASSED: SUBMITTED_CONFIRMED verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: All Failed -> FAILED
  // ---------------------------------------------------------------------------
  console.log('[Test 4] Testing all failed scenario...');
  const pageAllFailed = createMockVerificationPage('all_failed');
  const resAllFailed = await verifyLiveFormDom(pageAllFailed, testFields, {
    initialUrl: 'http://127.0.0.1:4000/form',
    isSubmitAction: false
  });

  console.log('  -> Status:', resAllFailed.status);
  assert.strictEqual(resAllFailed.status, 'FAILED');
  const failedMsg = enforceVerifiedMessage('Done', resAllFailed);
  assert(failedMsg.includes('Form Status: FAILED'), 'Message must report FAILED status');
  console.log('✓ Test 4 PASSED: FAILED status verified.\n');

  console.log('===================================================================');
  console.log('ALL PHASE 3 VERIFIER & TRUTHFUL REPORTING TESTS PASSED (4/4)!');
  console.log('===================================================================');
}

runPhase3Tests().catch((err) => {
  console.error('PHASE 3 TEST FAILED:', err);
  process.exit(1);
});
