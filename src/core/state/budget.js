import crypto from 'crypto';

/**
 * Deterministically serializes any JavaScript object or primitive by recursively
 * sorting object keys, ensuring identical arguments have identical JSON representations.
 */
export function canonicalJson(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(val[k])).join(',') + '}';
}

/**
 * Generates a SHA-256 fingerprint for a tool name and its normalized arguments.
 */
export function fingerprintToolCall(toolName, toolArgs) {
  const normArgs = canonicalJson(toolArgs || {});
  return crypto.createHash('sha256').update(`${toolName}:${normArgs}`).digest('hex');
}

/**
 * Calculates estimated cost in USD for a turn counting input, output,
 * and internal thinking tokens.
 */
export function calculateTurnCost(usageMetadata = {}, model = process.env.DEFAULT_MODEL || 'meta-muse-spark') {
  if (!usageMetadata) return { costUsd: 0, inputTokens: 0, outputTokens: 0, thoughtTokens: 0 };

  const inputTokens =
    usageMetadata.promptTokenCount ?? usageMetadata.total_input_tokens ?? usageMetadata.inputTokens ?? 0;
  const outputTokens =
    usageMetadata.candidatesTokenCount ?? usageMetadata.total_output_tokens ?? usageMetadata.outputTokens ?? 0;
  const thoughtTokens =
    usageMetadata.total_thought_tokens ?? usageMetadata.totalThoughtTokens ?? usageMetadata.thoughtTokens ?? 0;

  // Meta Muse model pricing calculation (Meta Muse Spark Open, Muse Wonder, Muse Spark API)
  const m = String(model || '').toLowerCase();
  let inputRate = 0.00000015;
  let outputRate = 0.00000060;

  if (m.includes('wonder')) {
    inputRate = 0.000003;
    outputRate = 0.000015;
  } else if (m.includes('spark-1.3') || m.includes('spark-1.2')) {
    inputRate = 0.00000125;
    outputRate = 0.0000050;
  } else if (m.includes('open') || m.includes('spark-open') || m.includes('816b')) {
    inputRate = 0.00000015;
    outputRate = 0.00000060;
  }

  const costUsd = Number(
    (inputTokens * inputRate + (outputTokens + thoughtTokens) * outputRate).toFixed(6)
  );

  return {
    costUsd,
    inputTokens,
    outputTokens,
    thoughtTokens
  };
}

/**
/**
 * Computes the initial turn budget based on the user's task complexity.
 * In dynamic mode, this ceiling automatically expands as the agent makes forward progress.
 */
export function computeInitialTurnBudget(instruction = '') {
  const text = String(instruction || '').trim();
  if (!text) return 60;
  const isComplexWebOrFormTask =
    /https?:\/\/|\b(apply|application|form|fill|submit|upload|multi-step|register|checkout|scrape|workflow|pipeline|refactor|build|implement)\b/i.test(
      text
    );
  if (isComplexWebOrFormTask || text.length > 250) {
    return 100;
  }
  return 60;
}

/**
 * Tracks multi-dimensional budgets:
 * - dynamic or explicit max_turns (scales to 100+ turns when making progress)
 * - cost cap (counting thinking tokens)
 * - max_identical_calls (fingerprint normalized args)
 * - wall-clock timeout
 * - typed stop reason ('success' | 'max_turns' | 'max_budget' | 'repeated_calls' | 'timeout' | 'error')
 */
export class AgentBudgetTracker {
  constructor(options = {}) {
    const hasExplicitNumericMaxTurns =
      typeof options.maxTurns === 'number' &&
      Number.isFinite(options.maxTurns) &&
      options.maxTurns > 0;

    this.dynamicTurns =
      options.dynamicTurns !== undefined
        ? Boolean(options.dynamicTurns)
        : !hasExplicitNumericMaxTurns;

    this.initialMaxTurns = hasExplicitNumericMaxTurns
      ? options.maxTurns
      : computeInitialTurnBudget(options.instruction);
    this.maxTurns = this.initialMaxTurns;
    this.maxTurnExpansionStep = options.maxTurnExpansionStep ?? 30;
    this.maxStallTurns = options.maxStallTurns ?? 15;

    this.maxBudgetUsd = options.maxBudgetUsd ?? 2.00;
    this.maxIdenticalCalls = options.maxIdenticalCalls ?? 5;
    this.timeoutMs = options.timeoutMs ?? 600000;
    this.model = options.model || process.env.DEFAULT_MODEL || 'meta-muse-spark';

    this.turnCount = 0;
    this.cumulativeCostUsd = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalThoughtTokens = 0;

    this.callFingerprints = new Map();
    this.distinctFingerprints = new Set();
    this.maxConsecutiveIdentical = options.maxConsecutiveIdentical ?? 3;
    this.callHistory = [];
    this.mutationCounter = 0;
    this.progressEvents = 0;
    this.lastProgressTurn = 0;
    this.turnExpansions = 0;
    this.startTime = Date.now();
    this.stopReason = null;
  }

  recordProgress(amount = 1) {
    this.progressEvents += Math.max(1, Number(amount) || 1);
    this.lastProgressTurn = this.turnCount;
  }

  checkTimeout() {
    if (this.stopReason) return this.stopReason;
    if (Date.now() - this.startTime >= this.timeoutMs) {
      this.stopReason = 'timeout';
      return 'timeout';
    }
    return null;
  }

  recordTurnStart() {
    const timeoutReason = this.checkTimeout();
    if (timeoutReason) return timeoutReason;

    this.turnCount++;

    // Dynamic turn scaling: if the agent is approaching the current turn ceiling
    // and has been making forward progress within the stall window, automatically
    // expand the turn budget so long multi-step tasks (100+ turns) never die arbitrarily.
    if (
      this.dynamicTurns &&
      this.maxTurns !== null &&
      this.maxTurns !== undefined &&
      this.maxTurns !== Infinity &&
      this.turnCount >= this.maxTurns - 5
    ) {
      const turnsSinceProgress = this.turnCount - this.lastProgressTurn;
      if (this.progressEvents > 0 && turnsSinceProgress <= this.maxStallTurns) {
        this.maxTurns += this.maxTurnExpansionStep;
        this.turnExpansions++;
      }
    }

    if (
      this.maxTurns !== null &&
      this.maxTurns !== undefined &&
      this.maxTurns !== Infinity &&
      this.maxTurns !== 0 &&
      this.turnCount > this.maxTurns
    ) {
      this.stopReason = 'max_turns';
      return 'max_turns';
    }
    return null;
  }

  recordTokenUsage(usageMetadata) {
    const { costUsd, inputTokens, outputTokens, thoughtTokens } = calculateTurnCost(
      usageMetadata,
      this.model
    );

    this.cumulativeCostUsd = Number((this.cumulativeCostUsd + costUsd).toFixed(6));
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.totalThoughtTokens += thoughtTokens;

    if (this.cumulativeCostUsd > this.maxBudgetUsd) {
      this.stopReason = 'max_budget';
      return 'max_budget';
    }
    return null;
  }

  recordToolCall(toolName, toolArgs) {
    const isMutatingTool =
      toolName === 'browser_action' ||
      toolName === 'browser_read_page' ||
      toolName === 'read_page' ||
      toolName === 'form_execute_batch' ||
      toolName === 'file_write' ||
      toolName === 'file_edit' ||
      toolName === 'shell_run';

    if (isMutatingTool) {
      this.mutationCounter++;
    }

    // Read-only page snapshots after a browser mutation inspect a NEW page state;
    // include the current mutationCounter so legitimate post-action snapshots do not
    // trip the cumulative identical-call cap, while consecutive snapshots without
    // any intervening mutation still share a fingerprint and get caught.
    const effectiveArgs =
      toolName === 'snapshot_read'
        ? { ...(toolArgs || {}), _mutationEpoch: this.mutationCounter }
        : toolArgs;

    const fp = fingerprintToolCall(toolName, effectiveArgs);
    const count = (this.callFingerprints.get(fp) || 0) + 1;
    this.callFingerprints.set(fp, count);
    this.callHistory.push({ toolName, fp, toolArgs, timestamp: Date.now() });

    if (!this.distinctFingerprints.has(fp)) {
      this.distinctFingerprints.add(fp);
      this.recordProgress(1);
    }

    // 1. Cumulative identical calls limit
    if (count > this.maxIdenticalCalls) {
      this.stopReason = 'repeated_calls';
      return {
        allowed: false,
        stopReason: 'repeated_calls',
        fingerprint: fp,
        count,
        cycleType: 'cumulative_identical'
      };
    }

    // 2. Cycle Detector: Consecutive identical calls
    const historyLen = this.callHistory.length;
    if (historyLen >= this.maxConsecutiveIdentical) {
      const recentSlice = this.callHistory.slice(-this.maxConsecutiveIdentical);
      if (recentSlice.every((item) => item.fp === fp)) {
        this.stopReason = 'repeated_calls';
        return {
          allowed: false,
          stopReason: 'repeated_calls',
          fingerprint: fp,
          count,
          cycleType: 'consecutive_identical'
        };
      }
    }

    // 3. Cycle Detector: Periodic repeating cycles
    for (let period = 2; period <= 6; period++) {
      if (historyLen >= 2 * period) {
        let isPeriodicCycle = true;
        for (let i = 0; i < period; i++) {
          const prevCall = this.callHistory[historyLen - 2 * period + i];
          const currCall = this.callHistory[historyLen - period + i];
          if (prevCall.fp !== currCall.fp) {
            isPeriodicCycle = false;
            break;
          }
        }
        if (isPeriodicCycle) {
          const sliceFps = new Set(this.callHistory.slice(-period).map((c) => c.fp));
          if (sliceFps.size > 1) {
            this.stopReason = 'repeated_calls';
            return {
              allowed: false,
              stopReason: 'repeated_calls',
              fingerprint: fp,
              count,
              cycleType: period === 2 ? 'ping_pong_cycle' : `periodic_cycle_${period}`
            };
          }
        }
      }
    }

    return {
      allowed: true,
      fingerprint: fp,
      count
    };
  }

  resetCycle(toolName = null) {
    if (this.stopReason === 'repeated_calls') {
      this.stopReason = null;
    }
    if (this.callHistory.length > 0) {
      this.callHistory = this.callHistory.slice(-2);
    }
  }

  finish(reason = null) {
    if (!this.stopReason) {
      this.stopReason = reason || 'success';
    }
    return this.getSummary();
  }

  getSummary() {
    return {
      stopReason: this.stopReason || 'success',
      turns: this.turnCount,
      maxTurns: this.maxTurns,
      dynamicTurns: this.dynamicTurns,
      turnExpansions: this.turnExpansions,
      progressEvents: this.progressEvents,
      costUsd: this.cumulativeCostUsd,
      elapsedMs: Date.now() - this.startTime,
      usage: {
        inputTokens: this.totalInputTokens,
        outputTokens: this.totalOutputTokens,
        thoughtTokens: this.totalThoughtTokens,
        totalTokens: this.totalInputTokens + this.totalOutputTokens + this.totalThoughtTokens
      }
    };
  }
}
