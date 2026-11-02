/**
 * reviewer.js
 *
 * Level 4: Independent Risky-Action Reviewer (separate toolless model call + code gate).
 *
 * Rules:
 * - Invoked before any risky action:
 *   1. Navigating to a new domain
 *   2. Clicking final submit
 *   3. Calling any tool outside the verified Fill Plan
 *   4. Uploading a file to a different origin
 * - Sees ONLY:
 *   - User's original request
 *   - Active BIO profile name (never raw values)
 *   - Proposed action summary
 *   - Deterministic injection-scanner warning log (never raw page text)
 * - Returns { decision: 'allow' | 'deny', reason } validated by validateReviewerDecision.
 */

import { getLevelToolRegistry, checkLevelToolAccess } from './registries.js';
import { validateReviewerDecision } from './schema.js';
import { isApprovedHost } from '../tools/policy.js';
import { streamModelTurn } from '../models/model-adapter.js';

export const REVIEWER_SYSTEM_PROMPT = `You are the Level 4 Security Reviewer for Dotta.
You have ZERO tools and never see raw web page text or personal BIO values.
You receive ONLY:
1. The user's original request
2. The active BIO profile name
3. The proposed risky action
4. The deterministic injection-scanner warning log

Deny the action ("decision": "deny") if:
- It navigates or uploads data to an unapproved third-party domain not requested by the user
- It calls a tool outside the verified form-filling plan
- It attempts to submit a form when the user or BIO rules explicitly requested filling only without submitting

For final form submission ("decision": "allow"), set "requiresUserConfirmation":
- false when:
  * userApproved is true (user already clicked Approve in the UI / thread)
  * OR executionMode is "turbo" and allRequiredFieldsReady is true (unless isHighRiskApplication is true without user approval)
  * OR the user's instruction semantically authorizes/approves submission in any phrasing or language (e.g., "go ahead", "yes, do it", "send it through", "looks good, finalize it", "sure, submit the application", "knock yourself out", "vas-y, envoie", "schick es ab") and allRequiredFieldsReady is true
- true when:
  * executionMode is "review" / "request_review" (and userApproved is false)
  * OR executionMode is "default" and the user did not express direct approval/authorization
  * OR isHighRiskApplication is true and the user did not express approval/authorization
  * OR allRequiredFieldsReady is false

Return ONLY valid JSON: {"decision": "allow" | "deny", "requiresUserConfirmation": boolean, "reason": "short explanation"}`;

export const DO_NOT_SUBMIT_RE =
  /\b(do\s+not\s+submit|don'?t\s+submit|without\s+submitting|only\s+fill|just\s+fill|never\s+submit|ask\s+before\s+submitting|confirm\s+before\s+submitting|review\s+before\s+submit)\b/i;

export const NATURAL_USER_APPROVAL_RE =
  /\b(go\s+ahead|proceed(?:\s+and\s+submit|\s+without\s+asking|\s+with\s+submission)?|do\s+it|send\s+it(?:\s+through|\s+in|\s+now)?|submit\s+it(?:\s+now)?|submit\s+without\s+asking|auto[- ]?submit|finalize(?:\s+it)?|looks\s+good|approved|confirmed|yes\s*,?\s*(?:please|do\s+it|send|submit|apply|proceed|finalize)|sure\s*,?\s*(?:do\s+it|send|submit|apply|proceed|finalize)|knock\s+yourself\s+out|make\s+it\s+happen|fire\s+away|vas-y|envoie(?:-le)?|env[ií]a(?:lo)?|schick\s+es\s+ab|mach\s+weiter)\b/i;

export function hasDoNotSubmitIntent(text = '') {
  return DO_NOT_SUBMIT_RE.test(String(text || ''));
}

export function hasThreadApprovalForSubmit(approvals = null) {
  if (!approvals) return false;
  const set =
    approvals instanceof Set
      ? approvals
      : new Set(Array.isArray(approvals) ? approvals : Object.keys(approvals));
  for (const item of set) {
    const k = String(item || '').toLowerCase();
    if (
      k === '*' ||
      k === 'all' ||
      k === 'submit' ||
      k === 'final_submit' ||
      k === 'submit_form' ||
      k === 'browser_action' ||
      k === 'browser_action:*' ||
      k.includes('submit')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Determine whether the user approved or authorized submission via UI/thread approval
 * or natural-language phrasing (in English or foreign languages).
 */
export function hasNaturalUserApprovalIntent(
  userInstruction = '',
  { userApproved = false, approvals = null } = {}
) {
  if (userApproved === true || hasThreadApprovalForSubmit(approvals)) {
    return true;
  }
  const instr = String(userInstruction || '');
  if (hasDoNotSubmitIntent(instr)) {
    return false;
  }
  return NATURAL_USER_APPROVAL_RE.test(instr);
}

const reviewerAuditLog = [];

export function getReviewerAuditLog() {
  return [...reviewerAuditLog];
}

export function clearReviewerAuditLog() {
  reviewerAuditLog.length = 0;
}

function extractHost(urlStr = '') {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Determine whether a proposed action is risky and requires Level 4 Review.
 */
export function isRiskyAction(proposedAction = {}, { currentOriginHost = '', approvedHosts = new Set() } = {}) {
  const kind = String(proposedAction.kind || '').toLowerCase();

  if (kind === 'submit') return { risky: true, category: 'final_submit' };
  if (kind === 'out_of_plan_tool') return { risky: true, category: 'out_of_plan_tool' };

  if (kind === 'navigate') {
    const targetHost = extractHost(proposedAction.targetUrl || proposedAction.targetOrigin || '');
    if (!targetHost) return { risky: false, category: null };
    if (currentOriginHost && targetHost !== currentOriginHost.toLowerCase()) {
      return { risky: true, category: 'cross_domain_navigation', targetHost };
    }
    if (!isApprovedHost(targetHost, approvedHosts)) {
      return { risky: true, category: 'unapproved_domain_navigation', targetHost };
    }
    return { risky: false, category: null };
  }

  if (kind === 'upload') {
    const targetHost = extractHost(proposedAction.targetUrl || proposedAction.targetOrigin || '');
    if (
      (currentOriginHost && targetHost && targetHost !== currentOriginHost.toLowerCase()) ||
      (targetHost && !isApprovedHost(targetHost, approvedHosts))
    ) {
      return { risky: true, category: 'cross_origin_upload', targetHost };
    }
    return { risky: false, category: null };
  }

  return { risky: false, category: null };
}

function evaluateDeterministicPolicy({
  userInstruction = '',
  mode = 'default',
  proposedAction = {},
  currentOriginHost = '',
  approvedHosts = new Set(),
  bioRulesText = '',
  allRequiredFieldsReady = true,
  isHighRiskApplication = false,
  userApproved = false,
  approvals = null
}) {
  const kind = String(proposedAction.kind || '').toLowerCase();
  const targetHost = extractHost(proposedAction.targetUrl || proposedAction.targetOrigin || '');

  // 1. Out-of-plan tool call is always denied
  if (kind === 'out_of_plan_tool') {
    return {
      decision: 'deny',
      reason: `Tool "${proposedAction.toolName || 'unknown'}" is outside the verified form-filling plan.`,
      requiresUserConfirmation: false,
      hardConstraint: true
    };
  }

  // 2. Cross-origin file upload to a different or unapproved domain is denied
  if (kind === 'upload') {
    if (currentOriginHost && targetHost && targetHost !== currentOriginHost.toLowerCase()) {
      return {
        decision: 'deny',
        reason: `Blocked cross-origin file upload to "${targetHost}" (active form origin is "${currentOriginHost}").`,
        requiresUserConfirmation: false,
        hardConstraint: true
      };
    }
    if (targetHost && !isApprovedHost(targetHost, approvedHosts)) {
      return {
        decision: 'deny',
        reason: `Blocked file upload to unapproved host "${targetHost}".`,
        requiresUserConfirmation: false,
        hardConstraint: true
      };
    }
  }

  // 3. Cross-domain navigation to an unapproved host not in the user's request is denied
  if (kind === 'navigate') {
    const userNamedTarget =
      targetHost && String(userInstruction || '').toLowerCase().includes(targetHost);
    if (!userNamedTarget && !isApprovedHost(targetHost, approvedHosts)) {
      return {
        decision: 'deny',
        reason: `Blocked navigation to unapproved external domain "${targetHost}" not requested by the user.`,
        requiresUserConfirmation: false,
        hardConstraint: true
      };
    }
  }

  // 4. Final submit gate:
  //    - Explicit UI/thread approval (userApproved / approvals cache) -> autonomous submit when required BIO data ready.
  //    - Turbo mode -> autonomous submit once all required fields are ready from BIO, unless user/BIO rules forbid it or high-risk without user approval.
  //    - Natural-language user approval ("go ahead", "yes, do it", "send it through", "looks good, finalize it", "knock yourself out", etc.) -> autonomous submit when required BIO data ready (outside Review mode).
  //    - Default / Request-a-Review mode -> pauses for confirmation unless already approved.
  if (kind === 'submit') {
    const instr = String(userInstruction || '');
    const bioRules = String(bioRulesText || '');
    const explicitUiOrThreadApproval =
      userApproved === true || hasThreadApprovalForSubmit(approvals);

    const explicitDoNotSubmitInPrompt = hasDoNotSubmitIntent(instr);
    const explicitDoNotSubmitInBio = hasDoNotSubmitIntent(bioRules);
    const naturalApproval = hasNaturalUserApprovalIntent(instr, {
      userApproved: explicitUiOrThreadApproval,
      approvals
    });

    if (explicitDoNotSubmitInPrompt || (explicitDoNotSubmitInBio && !naturalApproval)) {
      return {
        decision: 'deny',
        reason: 'User instructions or BIO rules explicitly requested filling only without automatic submission.',
        requiresUserConfirmation: true,
        hardConstraint: true
      };
    }

    if (!allRequiredFieldsReady) {
      return {
        decision: 'allow',
        reason: 'Required form fields are still missing from BIO; pausing before final submission.',
        requiresUserConfirmation: true,
        hardConstraint: true
      };
    }

    // If the user explicitly clicked Approve in the UI / thread confirmation card, proceed in any mode
    if (explicitUiOrThreadApproval && allRequiredFieldsReady) {
      return {
        decision: 'allow',
        reason: 'User explicitly approved final submission in the thread/UI and all required BIO data are ready.',
        requiresUserConfirmation: false,
        hardConstraint: false
      };
    }

    const normMode = String(mode || 'default').toLowerCase();
    if (normMode === 'review' || normMode === 'request_review') {
      return {
        decision: 'allow',
        reason: 'Request-a-Review mode selected: pausing for user approval before final submission.',
        requiresUserConfirmation: true,
        hardConstraint: true
      };
    }

    const highRiskApp = Boolean(
      isHighRiskApplication ||
        proposedAction.isHighRiskApplication ||
        proposedAction.riskLevel === 'high' ||
        /\b(wire\s+transfer|bank\s+transfer|payment|binding\s+legal|tax\s+filing|loan\s+application|credit\s+application|legally\s+binding|non-refundable|financial\s+commitment)\b/i.test(
          `${proposedAction.buttonLabel || ''} ${proposedAction.description || ''}`
        )
    );

    if (naturalApproval && allRequiredFieldsReady) {
      return {
        decision: 'allow',
        reason: 'User authorized submission and all required BIO contexts and data are available.',
        requiresUserConfirmation: false,
        hardConstraint: false
      };
    }

    if (highRiskApp && !naturalApproval) {
      return {
        decision: 'allow',
        reason: 'High-risk application requires explicit user confirmation unless user authorized submission.',
        requiresUserConfirmation: true,
        hardConstraint: false
      };
    }

    if (normMode === 'turbo') {
      return {
        decision: 'allow',
        reason: 'Turbo mode selected and all required fields completed from BIO; submitting autonomously.',
        requiresUserConfirmation: false,
        hardConstraint: false
      };
    }

    return {
      decision: 'allow',
      reason: 'Default mode selected: pausing for user confirmation before final submission.',
      requiresUserConfirmation: true,
      hardConstraint: false
    };
  }

  return {
    decision: 'allow',
    reason: 'Action aligns with user request and approved host policy.',
    requiresUserConfirmation: false,
    hardConstraint: false
  };
}

/**
 * Run Level 4 Reviewer on a risky action.
 */
export async function runReviewerLevel({
  userInstruction = '',
  activeProfileName = 'Default Profile',
  mode = 'default',
  proposedAction = {},
  currentOriginHost = '',
  approvedHosts = new Set(),
  scannerWarnings = [],
  bioRulesText = '',
  allRequiredFieldsReady = true,
  isHighRiskApplication = false,
  userApproved = false,
  approvals = null,
  model = 'muse-spark-open',
  mockModelCall = null,
  useLiveModel = false
} = {}) {
  const tools = getLevelToolRegistry('reviewer');
  if (tools.length !== 0) {
    throw new Error('Security invariant violation: Level 4 Reviewer must have 0 tools.');
  }

  // Build sanitized review context (NEVER includes raw page text or personal BIO values)
  const reviewContext = {
    userOriginalRequest: String(userInstruction || '').slice(0, 600),
    activeProfileName: String(activeProfileName || 'Default Profile').slice(0, 80),
    executionMode: mode,
    userApproved: Boolean(userApproved || hasThreadApprovalForSubmit(approvals)),
    allRequiredFieldsReady: Boolean(allRequiredFieldsReady),
    isHighRiskApplication: Boolean(isHighRiskApplication || proposedAction.isHighRiskApplication),
    proposedAction: {
      kind: proposedAction.kind,
      toolName: proposedAction.toolName || null,
      targetUrl: proposedAction.targetUrl || null,
      buttonLabel: proposedAction.buttonLabel || null
    },
    scannerWarningCount: Array.isArray(scannerWarnings) ? scannerWarnings.length : 0,
    scannerWarnings: (scannerWarnings || []).slice(0, 10).map((w) => ({
      fieldKey: w.fieldKey || w.source || 'page',
      reason: w.reason || 'warning'
    }))
  };

  const deterministic = evaluateDeterministicPolicy({
    userInstruction,
    mode,
    proposedAction,
    currentOriginHost,
    approvedHosts,
    bioRulesText,
    allRequiredFieldsReady,
    isHighRiskApplication,
    userApproved,
    approvals
  });

  let modelDecision = null;
  if (typeof mockModelCall === 'function') {
    const res = await mockModelCall({
      level: 'reviewer',
      model,
      systemInstruction: REVIEWER_SYSTEM_PROMPT,
      reviewContext,
      tools
    });
    if (Array.isArray(res?.functionCalls) && res.functionCalls.length > 0) {
      const check = checkLevelToolAccess('reviewer', res.functionCalls[0].name);
      const deniedEntry = {
        timestamp: Date.now(),
        proposedAction: reviewContext.proposedAction,
        decision: 'deny',
        reason: check.error,
        requiresUserConfirmation: false
      };
      reviewerAuditLog.push(deniedEntry);
      return deniedEntry;
    }
    const rawText = typeof res === 'string' ? res : res?.text || '';
    const validated = validateReviewerDecision(rawText);
    if (validated.valid) {
      modelDecision = validated.data;
    }
  } else if (useLiveModel) {
    try {
      const turn = await streamModelTurn({
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(reviewContext, null, 2) }] }],
        systemInstruction: REVIEWER_SYSTEM_PROMPT,
        model,
        tools: []
      });
      const cleaned = String(turn?.text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const validated = validateReviewerDecision(cleaned);
      if (validated.valid) {
        modelDecision = validated.data;
      }
    } catch {}
  }

  // Deny wins between deterministic policy and model review
  const finalDecision =
    deterministic.decision === 'deny' || modelDecision?.decision === 'deny' ? 'deny' : 'allow';
  const finalReason =
    deterministic.decision === 'deny'
      ? deterministic.reason
      : modelDecision?.decision === 'deny'
        ? modelDecision.reason
        : modelDecision?.reason || deterministic.reason;

  // When hard security constraints pass (no cross-origin exfil, no missing BIO fields, not Review mode without UI approval),
  // allow the Level 4 Reviewer model's semantic assessment of user approval to set requiresUserConfirmation.
  let finalRequiresUserConfirmation = deterministic.requiresUserConfirmation;
  if (
    finalDecision === 'allow' &&
    !deterministic.hardConstraint &&
    typeof modelDecision?.requiresUserConfirmation === 'boolean'
  ) {
    finalRequiresUserConfirmation = modelDecision.requiresUserConfirmation;
  }

  const entry = {
    timestamp: Date.now(),
    proposedAction: reviewContext.proposedAction,
    decision: finalDecision,
    reason: finalReason,
    requiresUserConfirmation: finalRequiresUserConfirmation,
    hardConstraint: Boolean(deterministic.hardConstraint),
    reviewContextSent: reviewContext
  };
  reviewerAuditLog.push(entry);
  return entry;
}
