/**
 * pipeline.js
 *
 * End-to-end Multi-Level Form-Filling & Web-Task Pipeline Orchestrator.
 * Coordinates:
 * - Level 1: Browser Subagent (isolated per-run sandbox, only browser tools)
 * - Level 2A: Deterministic Code Extractor (DOM + accessibility tree -> FormSchema)
 * - Level 2B: Independent Toolless Reader (visible text only -> FormSchema)
 * - Level 2C: Deterministic Code Comparator (VERIFIED vs DISPUTED)
 * - Level 3: Isolated Planner (active-profile BIO read tools only, separate scratch sandbox,
 *            owner-only 0o600 temporary Fill Plan file)
 * - Level 1 Custom Executor: Batch DOM script per section + human-like fallback + DOM re-read
 * - Level 4: Independent Risky-Action Reviewer + Mode-Aware Submit Gate
 */

import { createRunSandbox, destroyRunSandbox } from '../execution/run-sandbox.js';
import { collectApprovedHosts } from '../tools/policy.js';
import { getActiveProfile } from '../bio/store.js';
import { getSameFamilyModelCandidates } from '../media/media-processor.js';
import { extractFormSchemaFromHtml } from './extractor.js';
import { runReaderLevel } from './reader.js';
import { compareExtractorAndReaderSchemas } from './comparator.js';
import { runPlannerLevel } from './planner.js';
import { runCustomPlanExecutor } from './executor.js';
import { runReviewerLevel } from './reviewer.js';
import {
  readTemporaryFillPlan,
  destroyTemporaryFillPlan,
  redactPiiAndInternalIds
} from './plan-file.js';

export async function runMultiLevelFormPipeline({
  runId = `form-run-${Date.now()}`,
  userId,
  userInstruction = 'Fill out this application form',
  url = 'https://jobs.lever.co/example/apply',
  html = '',
  mode = 'default',
  model = 'muse-spark-open',
  attachments = [],
  storedAnswers = {},
  mockReaderCall = null,
  mockReviewerCall = null,
  browserExecutor = null,
  proposedPostFillActions = [],
  previousCheckpoint = null,
  onEvent = null,
  simulateCrashAfterPlanWrite = false
} = {}) {
  const startTimeMs = Date.now();
  const emit = (evt) => {
    if (typeof onEvent === 'function') onEvent(evt);
  };

  // Enforce Meta model family rule across all levels
  const familyInfo = getSameFamilyModelCandidates(model);
  const activeModel = familyInfo.selectedModel;

  // Create Level 1 Browser Sandbox (separate from Planner scratch sandbox)
  const level1Sandbox = createRunSandbox(runId);
  const profile = userId ? getActiveProfile(userId) : null;
  const approvedHosts = collectApprovedHosts([userInstruction, url]);
  let currentOriginHost = '';
  try {
    currentOriginHost = new URL(url).hostname.toLowerCase();
  } catch {}

  let planFileRecord = null;
  let planCleanupReport = null;
  let level1CleanupReport = null;

  try {
    emit({
      type: 'PIPELINE_LEVEL_START',
      level: 'level1_browser_subagent',
      runId,
      sandboxRoot: level1Sandbox.sandboxRoot,
      model: activeModel,
      modelFamily: familyInfo.family,
      timestamp: Date.now()
    });

    // LEVEL 2A: Deterministic Code Extractor inside Level 1 sandbox
    const extractorResult = extractFormSchemaFromHtml(html, { url });
    emit({
      type: 'PIPELINE_LEVEL_COMPLETE',
      level: 'level2a_extractor',
      fieldsExtracted: extractorResult.schema?.fields?.length || 0,
      excludedHiddenCount: extractorResult.excludedElements?.length || 0,
      scannerNotesCount: extractorResult.scannerNotes?.length || 0,
      timestamp: Date.now()
    });

    // LEVEL 2B: Independent Toolless Reader (receives ONLY raw visible page text, never Extractor output)
    const readerResult = await runReaderLevel({
      rawPageText: extractorResult.visiblePageText,
      model: activeModel,
      mockModelCall: mockReaderCall
    });
    emit({
      type: 'PIPELINE_LEVEL_COMPLETE',
      level: 'level2b_reader',
      valid: readerResult.valid,
      dropped: readerResult.dropped,
      fieldsRead: readerResult.schema?.fields?.length || 0,
      model: activeModel,
      modelFamily: familyInfo.family,
      timestamp: Date.now()
    });

    const readerSchemaForCompare = readerResult.valid ? readerResult.schema : { fields: [] };

    // LEVEL 2C: Deterministic Code Comparator
    const comparison = compareExtractorAndReaderSchemas(
      extractorResult.schema,
      readerSchemaForCompare
    );
    emit({
      type: 'PIPELINE_LEVEL_COMPLETE',
      level: 'level2c_comparator',
      verifiedCount: comparison.verifiedFields.length,
      disputedCount: comparison.disputedFields.length,
      disputedLog: comparison.disputedLog,
      timestamp: Date.now()
    });

    // Map any explicit task attachments by field kind
    const attachmentOverrides = {};
    for (const att of attachments || []) {
      const name = String(att.name || '').toLowerCase();
      if (/cv|resume|\.pdf$/i.test(name)) {
        attachmentOverrides.cv = { name: att.name, uploadRef: att.uploadRef || `biofile-att-${att.name}` };
      } else if (/\.(png|jpg|jpeg|webp)$/i.test(name)) {
        attachmentOverrides.photo = { name: att.name, uploadRef: att.uploadRef || `biofile-att-${att.name}` };
      }
    }

    // LEVEL 3: Isolated Planner (active-profile BIO read tools only, separate scratch sandbox)
    const plannerResult = await runPlannerLevel({
      runId,
      userId,
      mode,
      model: activeModel,
      verifiedFields: comparison.verifiedFields,
      requiredDisputedForUser: comparison.requiredDisputedForUser,
      attachmentOverrides,
      storedAnswers
    });

    if (!plannerResult.valid) {
      return {
        ok: false,
        stage: 'level3_planner',
        dropped: true,
        errors: plannerResult.errors
      };
    }

    planFileRecord = plannerResult.planFileRecord;

    emit({
      type: 'PIPELINE_LEVEL_COMPLETE',
      level: 'level3_planner',
      maskedAuditSummary: plannerResult.maskedAuditSummary,
      plannerSandboxRoot: planFileRecord.sandboxRoot,
      batchedQuestionsCount: plannerResult.batchedQuestions.length,
      timestamp: Date.now()
    });

    if (simulateCrashAfterPlanWrite) {
      throw new Error('Simulated crash after temporary Fill Plan write');
    }

    // Orchestrator reads and validates the temporary Fill Plan before passing to Level 1 Executor
    const validatedPlanFromDisk = readTemporaryFillPlan(runId, {
      expectedProfileId: profile?.id || null
    });
    if (!validatedPlanFromDisk.valid) {
      return {
        ok: false,
        stage: 'orchestrator_plan_handoff',
        dropped: true,
        errors: validatedPlanFromDisk.errors
      };
    }

    // LEVEL 1 CUSTOM EXECUTOR: Executes the validated Fill Plan in batches per section
    const executorResult = await runCustomPlanExecutor({
      fillPlan: validatedPlanFromDisk.data,
      expectedProfileId: profile?.id || null,
      browserExecutor,
      previousCheckpoint,
      onProgress: (prog) => emit(prog)
    });

    // LEVEL 4 REVIEWER: Evaluate any risky post-fill actions (e.g. final submit, cross-domain nav, cross-origin upload, out-of-plan tool)
    const allScannerWarnings = [
      ...(extractorResult.scannerNotes || []),
      ...(plannerResult.scannerWarnings || []),
      ...(plannerResult.unsupportedLog || [])
    ];

    const reviewerDecisions = [];
    const actionsToReview = [...proposedPostFillActions];
    if (
      actionsToReview.length === 0 &&
      Array.isArray(extractorResult.schema?.submitButtons) &&
      extractorResult.schema.submitButtons.length > 0
    ) {
      actionsToReview.push({
        kind: 'submit',
        buttonLabel: extractorResult.schema.submitButtons[0].label
      });
    }

    for (const action of actionsToReview) {
      const decision = await runReviewerLevel({
        userInstruction,
        activeProfileName: profile?.name || 'Default Profile',
        mode,
        proposedAction: action,
        currentOriginHost,
        approvedHosts,
        scannerWarnings: allScannerWarnings,
        model: activeModel,
        mockModelCall: mockReviewerCall
      });
      reviewerDecisions.push(decision);
      emit({
        type: 'PIPELINE_LEVEL_COMPLETE',
        level: 'level4_reviewer',
        decision: decision.decision,
        reason: decision.reason,
        requiresUserConfirmation: decision.requiresUserConfirmation,
        proposedAction: decision.proposedAction,
        timestamp: Date.now()
      });
    }

    // Build redacted user-facing summary (NEVER contains raw DOB, street address, or internal IDs)
    const filledLabels = executorResult.executionLog.map((e) => e.label);
    const rawSummaryLines = [];
    if (plannerResult.attachmentOverrideNotes.length > 0) {
      rawSummaryLines.push(...plannerResult.attachmentOverrideNotes);
    }
    rawSummaryLines.push(
      `Completed ${filledLabels.length} verified field(s) across ${executorResult.sectionCheckpoints.length} section(s): ${filledLabels.join(', ') || 'none'}.`
    );
    if (comparison.disputedFields.length > 0) {
      rawSummaryLines.push(
        `Left ${comparison.disputedFields.length} unverified/disputed field(s) untouched.`
      );
    }
    if (plannerResult.unsupportedLog.length > 0) {
      rawSummaryLines.push(
        `Skipped ${plannerResult.unsupportedLog.length} unsupported/non-standard field(s).`
      );
    }
    if (plannerResult.batchedQuestions.length > 0) {
      rawSummaryLines.push(
        `Please provide answers for ${plannerResult.batchedQuestions.length} remaining required question(s) in a single step.`
      );
    }

    const safeUserMessage = redactPiiAndInternalIds(rawSummaryLines.join(' '), profile);

    return {
      ok: true,
      runId,
      modelUsed: activeModel,
      modelFamily: familyInfo.family,
      durationMs: Date.now() - startTimeMs,
      sandboxes: {
        level1BrowserSandboxRoot: level1Sandbox.sandboxRoot,
        level3PlannerSandboxRoot: planFileRecord?.sandboxRoot || null,
        distinctSandboxes:
          Boolean(level1Sandbox.sandboxRoot && planFileRecord?.sandboxRoot) &&
          level1Sandbox.sandboxRoot !== planFileRecord.sandboxRoot
      },
      extractor: {
        fields: extractorResult.schema.fields,
        excludedElements: extractorResult.excludedElements,
        scannerNotes: extractorResult.scannerNotes
      },
      reader: {
        valid: readerResult.valid,
        dropped: readerResult.dropped,
        fields: readerResult.schema?.fields || [],
        tokenUsage: readerResult.tokenUsage
      },
      comparator: comparison,
      planner: {
        maskedAuditSummary: plannerResult.maskedAuditSummary,
        toolCallLog: plannerResult.toolCallLog,
        processedMediaLog: plannerResult.processedMediaLog,
        unsupportedLog: plannerResult.unsupportedLog,
        attachmentOverrideNotes: plannerResult.attachmentOverrideNotes,
        batchedQuestions: plannerResult.batchedQuestions,
        planFilePathDuringRun: planFileRecord?.planFilePath || null
      },
      executor: executorResult,
      reviewer: {
        decisions: reviewerDecisions
      },
      safeUserMessage,
      getCleanupStatus: () => ({
        planCleanupReport,
        level1CleanupReport
      })
    };
  } finally {
    planCleanupReport = destroyTemporaryFillPlan(runId);
    level1CleanupReport = await destroyRunSandbox(runId);
  }
}
