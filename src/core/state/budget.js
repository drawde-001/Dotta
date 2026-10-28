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

  // Multi-provider pricing calculation (Meta Muse, Anthropic Claude, OpenAI, DeepSeek, Google Gemini)
  const m = String(model || '').toLowerCase();
  let inputRate = 0.00000015;
  let outputRate = 0.00000060;

  if (m.includes('opus')) {
    inputRate = 0.000015;
    outputRate = 0.000075;
  } else if (m.includes('sonnet') || m.includes('claude-3-5') || m.includes('claude-3.5') || m.includes('fable')) {
    inputRate = 0.000003;
    outputRate = 0.000015;
  } else if (m.includes('haiku') || m.includes('gpt-4o-mini') || m.includes('sol') || m.includes('lite')) {
    inputRate = 0.00000015;
    outputRate = 0.00000060;
  } else if (m.includes('gpt-4o') || m.includes('terra') || m.includes('deepseek-chat')) {
    inputRate = 0.0000025;
    outputRate = 0.000010;
  } else if (m.includes('pro')) {
    inputRate = 0.00000125;
    outputRate = 0.0000050;
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
 * Tracks multi-dimensional budgets:
 * - max_turns
 * - cost cap (counting thinking tokens)
 * - max_identical_calls (fingerprint normalized args)
 * - wall-clock timeout
 * - typed stop reason ('success' | 'max_turns' | 'max_budget' | 'repeated_calls' | 'timeout' | 'error')
 */
export class AgentBudgetTracker {
  constructor(options = {}) {
    this.maxTurns = options.maxTurns ?? 50;
    this.maxBudgetUsd = options.maxBudgetUsd ?? 2.00;
    this.maxIdenticalCalls = options.maxIdenticalCalls ?? 5;
    this.timeoutMs = options.timeoutMs ?? 300000;
    this.model = options.model || process.env.DEFAULT_MODEL || 'meta-muse-spark';

    this.turnCount = 0;
    this.cumulativeCostUsd = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalThoughtTokens = 0;

    this.callFingerprints = new Map();
    this.maxConsecutiveIdentical = options.maxConsecutiveIdentical ?? 3;
    this.callHistory = [];
    this.startTime = Date.now();
    this.stopReason = null;
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
    const fp = fingerprintToolCall(toolName, toolArgs);
    const count = (this.callFingerprints.get(fp) || 0) + 1;
    this.callFingerprints.set(fp, count);
    this.callHistory.push({ toolName, fp, toolArgs, timestamp: Date.now() });

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
