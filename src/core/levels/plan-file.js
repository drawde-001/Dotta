/**
 * plan-file.js
 *
 * Temporary owner-only (0o600) Fill Plan file lifecycle in the Level 3 Planner's
 * isolated scratch sandbox, plus PII & internal-ID redaction utilities so raw
 * personal values never appear in chat, run logs, or the database.
 */

import fs from 'fs';
import path from 'path';
import { createRunSandbox, destroyRunSandbox, getRunSandbox } from '../execution/run-sandbox.js';
import { validateFillPlan } from './schema.js';

const activePlanFiles = new Map(); // runId -> { plannerRunId, planFilePath, sandboxRoot }

/**
 * Mask a personal value for safe progress display / logs (e.g., "A***n", "a***@example.com").
 */
export function maskPersonalValue(rawVal) {
  if (rawVal === null || rawVal === undefined) return '';
  const str = typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal).trim();
  if (!str) return '';
  if (str.startsWith('biofile-')) return '[staged-file]';
  if (str.includes('@') && str.indexOf('@') > 0) {
    const [local, domain] = str.split('@');
    return `${local[0]}***@${domain}`;
  }
  if (str.length <= 3) return '***';
  return `${str[0]}***${str[str.length - 1]}`;
}

/**
 * Redact internal BIO/file/profile IDs and sensitive personal fields (DOB, street address)
 * from any chat text or log message before emitting to UI or persisting to DB.
 */
export function redactPiiAndInternalIds(text = '', bioProfile = null) {
  let out = String(text || '');
  if (!out) return '';

  // 1. Redact internal IDs (entry:..., biofile-..., profile-..., answer-..., prop-...)
  out = out.replace(/\bentry:[a-zA-Z0-9_-]+\b/g, '[bio-entry]');
  out = out.replace(/\bbiofile-[a-zA-Z0-9._-]+\b/g, '[staged-file]');
  out = out.replace(/\bprofile-[a-f0-9-]{6,}\b/gi, '[active-profile]');
  out = out.replace(/\banswer-[a-f0-9-]{6,}\b/gi, '[stored-answer]');
  out = out.replace(/\bprop-[a-f0-9-]{6,}\b/gi, '[bio-proposal]');

  // 2. Redact active profile DOB and street address if present
  const fields = bioProfile?.fields || {};
  const dobVal = fields.dob || fields.dateOfBirth;
  if (typeof dobVal === 'string' && dobVal.trim().length >= 4) {
    const escapedDob = dobVal.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escapedDob, 'gi'), '[REDACTED-DOB]');
  }
  const street = typeof fields.address === 'string' ? fields.address : fields.address?.street;
  if (typeof street === 'string' && street.trim().length >= 5) {
    const escapedStreet = street.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escapedStreet, 'gi'), '[REDACTED-ADDRESS]');
  }

  return out;
}

/**
 * Build a masked audit summary of a Fill Plan safe for run logs and SSE progress events.
 * Raw personal values are NEVER included.
 */
export function buildMaskedPlanAuditSummary(fillPlan) {
  const items = Array.isArray(fillPlan?.items) ? fillPlan.items : [];
  return {
    runId: fillPlan?.runId || '',
    totalItems: items.length,
    readyCount: items.filter((i) => i.status === 'READY').length,
    missingCount: items.filter((i) => i.status === 'MISSING').length,
    unsupportedCount: items.filter((i) => i.status === 'UNSUPPORTED').length,
    items: items.map((item) => ({
      fieldKey: item.fieldKey,
      label: item.label,
      section: item.section || 'General',
      classifiedKind: item.classifiedKind,
      status: item.status,
      bioFieldId: item.bioSource?.fieldId || null,
      maskedValue: item.status === 'READY' ? maskPersonalValue(item.value) : null
    }))
  };
}

/**
 * Create an isolated Level 3 Planner scratch sandbox with zero network access
 * and write the validated Fill Plan JSON to an owner-only (0o600) temporary file.
 */
export function writeTemporaryFillPlan(runId, fillPlan, { expectedProfileId = null } = {}) {
  const validation = validateFillPlan(fillPlan, { expectedProfileId });
  if (!validation.valid) {
    const err = new Error(`FillPlan validation failed: ${validation.errors.join('; ')}`);
    err.validation = validation;
    throw err;
  }

  const plannerRunId = `${runId}__planner_scratch`;
  const plannerSandbox = createRunSandbox(plannerRunId, {
    strictNetworkAllowlist: true,
    networkAllowlist: [],
    allowLocalhost: false
  });

  const planFilePath = path.join(plannerSandbox.workDir, `fill-plan-${Date.now()}.json`);
  const serialized = JSON.stringify(validation.data, null, 2);
  fs.writeFileSync(planFilePath, serialized, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(planFilePath, 0o600);
  } catch {}

  const record = {
    runId,
    plannerRunId,
    planFilePath,
    sandboxRoot: plannerSandbox.sandboxRoot,
    workDir: plannerSandbox.workDir,
    mode: 0o600,
    createdAt: Date.now()
  };
  activePlanFiles.set(runId, record);
  return record;
}

/**
 * Read and validate the temporary Fill Plan from the Planner's scratch space.
 */
export function readTemporaryFillPlan(runId, { expectedProfileId = null } = {}) {
  const record = activePlanFiles.get(runId);
  if (!record || !record.planFilePath || !fs.existsSync(record.planFilePath)) {
    return { valid: false, dropped: true, errors: ['Temporary fill plan file does not exist.'] };
  }
  const raw = fs.readFileSync(record.planFilePath, 'utf8');
  return validateFillPlan(raw, { expectedProfileId });
}

/**
 * Destroy the temporary Fill Plan file and the Level 3 Planner scratch sandbox.
 * Safe and idempotent across normal completion, crash, cancel, or timeout.
 */
export function destroyTemporaryFillPlan(runId) {
  const record = activePlanFiles.get(runId);
  const plannerRunId = record?.plannerRunId || `${runId}__planner_scratch`;

  if (record?.planFilePath) {
    try {
      if (fs.existsSync(record.planFilePath)) {
        // Overwrite before unlinking so raw values do not linger
        fs.writeFileSync(record.planFilePath, '{}', { encoding: 'utf8', mode: 0o600 });
        fs.unlinkSync(record.planFilePath);
      }
    } catch {}
  }

  activePlanFiles.delete(runId);
  const sb = getRunSandbox(plannerRunId);
  if (sb) {
    sb.destroySync('plan_cleanup');
  }
  return {
    destroyed: true,
    planFilePath: record?.planFilePath || null,
    existsAfterCleanup: record?.planFilePath ? fs.existsSync(record.planFilePath) : false
  };
}
