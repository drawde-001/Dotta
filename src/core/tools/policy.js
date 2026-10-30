import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { canonicalJson } from '../state/budget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getAuditLogPath() {
  if (process.env.AGENT_AUDIT_LOG) return process.env.AGENT_AUDIT_LOG;
  const dir = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'audit.jsonl');
}

/**
 * Validates tool arguments against a lightweight JSON Schema parameter definition
 */
export function validateToolSchema(schema, args) {
  if (!schema || typeof schema !== 'object') return { valid: true };
  const params = args && typeof args === 'object' ? args : {};

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const reqField of required) {
    if (reqField === 'stepTitle' || reqField === 'step_title') continue;
    if (params[reqField] === undefined || params[reqField] === null || params[reqField] === '') {
      return {
        valid: false,
        error: `Missing required parameter "${reqField}"`,
        field: reqField
      };
    }
  }

  const properties = schema.properties || {};
  for (const [key, propDef] of Object.entries(properties)) {
    if (params[key] !== undefined && params[key] !== null) {
      const expectedType = String(propDef.type || '').toUpperCase();
      const actualVal = params[key];

      if (expectedType === 'STRING' && typeof actualVal !== 'string') {
        return { valid: false, error: `Parameter "${key}" must be a string, got ${typeof actualVal}`, field: key };
      }
      if (expectedType === 'INTEGER' || expectedType === 'NUMBER') {
        if (typeof actualVal !== 'number' || isNaN(actualVal)) {
          return { valid: false, error: `Parameter "${key}" must be a number, got ${typeof actualVal}`, field: key };
        }
      }
      if (expectedType === 'BOOLEAN' && typeof actualVal !== 'boolean') {
        return { valid: false, error: `Parameter "${key}" must be a boolean, got ${typeof actualVal}`, field: key };
      }
      if (expectedType === 'ARRAY' && !Array.isArray(actualVal)) {
        return { valid: false, error: `Parameter "${key}" must be an array`, field: key };
      }
    }
  }

  return { valid: true };
}

/**
 * Evaluates permission in strict order:
 * 1. DENY: blocks even in turbo mode (sensitive files, dangerous paths, blocked tools)
 * 2. ASK: requires human approval (destructive actions, form submissions, payments)
 * 3. MODE: default / review / turbo
 * 4. ALLOW: safe read-only actions
 * Fail closed: returns 'deny' for any unknown tool
 */
export function checkPermission(toolName, input = {}, mode = 'turbo', approvals = null, context = {}) {
  const normTool = String(toolName || '').trim();
  const args = input && typeof input === 'object' ? input : {};

  // STEP 1: DENY RULES
  const SENSITIVE_FILE_PATTERN = /(^\.env|\.env$|\.env\.|\.pem$|\.key$|^\.ssh$|[\\/]\.ssh[\\/]|id_rsa|id_ed25519|credentials\.json)/i;
  const SENSITIVE_CMD_PATTERN = /(?:^|[\s/\\;|&"'`])(\.env|\.pem|\.key|\.ssh|id_rsa|id_ed25519|credentials\.json)(?:$|[\s/\\;|&"'`])/i;

  const pathArg = typeof args.path === 'string' ? args.path.trim() : typeof args.filePath === 'string' ? args.filePath.trim() : '';
  const urlArg = typeof args.url === 'string' ? args.url.trim() : '';
  const commandArg = typeof args.command === 'string' ? args.command.trim() : typeof args.cmd === 'string' ? args.cmd.trim() : '';
  const patternArg = typeof args.pattern === 'string' ? args.pattern.trim() : '';
  const valueArg = typeof args.value === 'string' ? args.value.trim() : '';
  const targetArg = typeof args.selectorOrText === 'string' ? args.selectorOrText.trim() : '';

  if (
    (pathArg && SENSITIVE_FILE_PATTERN.test(pathArg)) ||
    (patternArg && SENSITIVE_FILE_PATTERN.test(patternArg)) ||
    (urlArg && (SENSITIVE_FILE_PATTERN.test(urlArg) || urlArg.includes('.env'))) ||
    (commandArg && SENSITIVE_CMD_PATTERN.test(commandArg)) ||
    (valueArg && (SENSITIVE_FILE_PATTERN.test(valueArg) || valueArg.includes('.env'))) ||
    (targetArg && SENSITIVE_FILE_PATTERN.test(targetArg))
  ) {
    return {
      decision: 'deny',
      reason: 'Access to sensitive credentials or environment files is strictly denied'
    };
  }

  const isAbsolute =
    pathArg &&
    (pathArg.startsWith('/') ||
      pathArg.startsWith('\\') ||
      /^[a-zA-Z]:[/\\]/.test(pathArg) ||
      /^[a-zA-Z]:$/i.test(pathArg));

  const isUnc =
    (pathArg && (/^[\\/]{2}/.test(pathArg) || /\\\\[a-z0-9_.-]+\\/i.test(pathArg))) ||
    (urlArg && (/^file:\/\/|^\\\\/i.test(urlArg) || /\\\\[a-z0-9_.-]+\\/i.test(urlArg))) ||
    (commandArg && (/\\\\[a-z0-9_.-]+\\/i.test(commandArg) || /\/\/[a-z0-9_.-]+\//i.test(commandArg)));

  const isPathTraversal =
    (pathArg && (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(pathArg) || pathArg.includes('../') || pathArg.includes('..\\'))) ||
    (patternArg && (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(patternArg) || patternArg.includes('../') || patternArg.includes('..\\')));
  const isCmdTraversal =
    commandArg &&
    (/(?:^|[\s/\\;|&"'`])\.\.(?:[/\\]|$|[\s/\\;|&"'`])/.test(commandArg) ||
      commandArg.includes('../') ||
      commandArg.includes('..\\'));
  const isValueTraversal =
    valueArg &&
    (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(valueArg) || valueArg.includes('../') || valueArg.includes('..\\'));

  const isCrossUser =
    (pathArg && (/(?:^|[\\/])users(?:[\\/]|$)/i.test(pathArg) || pathArg.includes('../users') || pathArg.includes('..\\users'))) ||
    (patternArg && (/(?:^|[\\/])users(?:[\\/]|$)/i.test(patternArg)));

  if (isPathTraversal || isCmdTraversal || isValueTraversal || isAbsolute || isUnc || isCrossUser) {
    return {
      decision: 'deny',
      reason: 'Path traversal (".."), absolute paths, UNC network paths, and cross-user paths are strictly denied'
    };
  }

  const DENIED_TOOLS = ['shell_exec', 'bash', 'system_cmd', 'file_eval'];
  if (DENIED_TOOLS.includes(normTool)) {
    return {
      decision: 'deny',
      reason: `Tool "${normTool}" is on the restricted security deny list`
    };
  }

  // STEP 1.25: BIO PERMISSION GATE (enforced in code, deny wins, runs before
  // any approval cache so BIO writes can never bypass the approval card)
  const BIO_READ_TOOLS = [
    'bio_index',
    'bio_get',
    'process_document',
    'process_image',
    'process_audio',
    'process_video'
  ];
  if (BIO_READ_TOOLS.includes(normTool) || normTool === 'bio_propose_write') {
    const bio = context?.bio || {};
    if (!bio.userId) {
      return { decision: 'deny', reason: 'BIO requires an identified user' };
    }
    if (BIO_READ_TOOLS.includes(normTool) && !bio.read) {
      return {
        decision: 'deny',
        reason:
          'BIO read access is off for the active profile. Do NOT use ask_user for this. Politely tell the user in plain text that you need BIO read access (BIO page, Agent Access, Read switch), or ask for the specific information in plain text.'
      };
    }
    if (normTool === 'bio_propose_write') {
      if (!bio.write) {
        return {
          decision: 'deny',
          reason:
            'BIO write access is off for the active profile. The save was not proposed. Do NOT use ask_user for this; if it matters, mention it politely in plain text.'
        };
      }
      return {
        decision: 'ask',
        reason: 'BIO writes always require user approval (field, old value, new value)'
      };
    }
    return { decision: 'allow', reason: 'BIO read permission granted for active profile' };
  }

  // STEP 1.5: PRIOR HUMAN APPROVALS CACHE
  if (approvals) {
    const approvalSet = approvals instanceof Set ? approvals : new Set(Array.isArray(approvals) ? approvals : Object.keys(approvals));
    const target = targetArg.toLowerCase();

    if (
      approvalSet.has('*') ||
      approvalSet.has('all') ||
      approvalSet.has(normTool) ||
      approvalSet.has(`${normTool}:*`) ||
      (targetArg && (approvalSet.has(targetArg) || approvalSet.has(`${normTool}:${targetArg}`))) ||
      (target && (approvalSet.has(target) || approvalSet.has(`${normTool}:${target}`)))
    ) {
      return {
        decision: 'allow',
        reason: 'Explicitly approved by user in current conversation'
      };
    }
  }

  // STEP 2: ASK RULES
  if (
    normTool === 'ask_user' ||
    normTool === 'submit_form' ||
    normTool === 'final_submit' ||
    normTool === 'file_delete'
  ) {
    return {
      decision: 'ask',
      reason: `Action "${normTool}" requires human confirmation before execution`
    };
  }

  if (normTool === 'browser_action') {
    const target = String(args.selectorOrText || '').toLowerCase();
    if (target.includes('password') || target.includes('credit') || target.includes('cvv')) {
      return {
        decision: 'ask',
        reason: `Interacting with sensitive field "${args.selectorOrText}" requires human confirmation`
      };
    }
  }

  // STEP 3: MODE RULES
  const KNOWN_READ_ONLY = [
    'browser_search',
    'web_search',
    'browser_read_page',
    'read_page',
    'file_read',
    'file_list',
    'file_search',
    'snapshot_read',
    'browser_screenshot',
    'profile_get',
    'shell_output',
    'generate_image',
    'agent_plan',
    'create_plan',
    'update_plan',
    'task_card',
    'create_task_card',
    'agent_status',
    'status_badge',
    'option_list',
    'select_options',
    'recommendation_card',
    'recommend_decision',
    'artifact_card',
    'create_artifact_card',
    'todo_list',
    'create_todo_list',
    'todos',
    'agent_handoff',
    'handoff_agent',
    'background_inbox',
    'background_runs',
    'checkpoint_history',
    'checkpoints'
  ];

  if (mode === 'default') {
    if (normTool === 'shell_run' || normTool === 'shell_kill') {
      return {
        decision: 'ask',
        reason: `Default mode requires confirmation before running shell command "${args.command || normTool}"`
      };
    }
  }

  if (mode === 'review') {
    if (!KNOWN_READ_ONLY.includes(normTool)) {
      return {
        decision: 'ask',
        reason: `Review mode: confirmation required for state-changing action "${normTool}"`
      };
    }
  }

  // STEP 4: ALLOW RULES
  const KNOWN_ALLOWED = [
    'workspace_create',
    'browser_search',
    'web_search',
    'browser_read_page',
    'read_page',
    'browser_action',
    'file_read',
    'file_list',
    'file_search',
    'file_write',
    'file_edit',
    'profile_get',
    'snapshot_read',
    'browser_screenshot',
    'shell_run',
    'shell_output',
    'shell_kill',
    'segment_image',
    'generate_image',
    'edit_image',
    'describe_image',
    'agent_plan',
    'create_plan',
    'update_plan',
    'task_card',
    'create_task_card',
    'agent_status',
    'status_badge',
    'option_list',
    'select_options',
    'recommendation_card',
    'recommend_decision',
    'artifact_card',
    'create_artifact_card',
    'todo_list',
    'create_todo_list',
    'todos',
    'agent_handoff',
    'handoff_agent',
    'background_inbox',
    'background_runs',
    'checkpoint_history',
    'checkpoints'
  ];

  if (KNOWN_ALLOWED.includes(normTool)) {
    return { decision: 'allow' };
  }

  // STEP 5: FAIL CLOSED
  return {
    decision: 'deny',
    reason: `Unknown or untrusted tool "${normTool}". Tool policy fails closed.`
  };
}

export const COST_BEARING_TOOL_CAPS = {
  segment_image: 10,
  generate_image: 10,
  edit_image: 10,
  describe_image: 20
};

export function checkToolRunCap(toolName, currentCount) {
  const cap = COST_BEARING_TOOL_CAPS[toolName];
  if (cap !== undefined && currentCount >= cap) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" exceeded per-run cap of ${cap} calls.`
    };
  }
  return { allowed: true };
}

export function capToolOutput(text, maxChars = 4000) {
  if (typeof text !== 'string') text = String(text || '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Output truncated: showing first ${maxChars} of ${text.length} characters]`;
}

export async function executeToolWithRetry({
  toolName,
  toolArgs,
  toolDef,
  executor,
  maxRetries = 2,
  initialBackoffMs = 50,
  maxOutputChars = 4000
}) {
  const startTime = Date.now();

  if (toolDef && toolDef.parameters) {
    const valResult = validateToolSchema(toolDef.parameters, toolArgs);
    if (!valResult.valid) {
      return {
        status: 'permanent_error',
        data: null,
        output: `Validation Error for ${toolName}: ${valResult.error}. Please correct the parameters and try again.`,
        durationMs: Date.now() - startTime,
        retries: 0
      };
    }
  }

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const rawResult = await executor(toolArgs);
      const rawText = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult || '');
      const outputText = capToolOutput(rawText, maxOutputChars);
      const isEmpty = !rawText || rawText.trim() === '' || rawText.includes('No direct results parsed');

      return {
        status: isEmpty ? 'empty' : 'ok',
        data: rawResult,
        output: outputText,
        durationMs: Date.now() - startTime,
        retries: attempt
      };
    } catch (err) {
      lastError = err;
      const isTransient =
        err.message?.includes('timeout') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('429') ||
        err.message?.includes('503') ||
        err.message?.includes('Navigation failed');

      if (!isTransient || attempt >= maxRetries) {
        return {
          status: isTransient ? 'retryable_error' : 'permanent_error',
          data: null,
          output: `Error executing ${toolName}: ${err.message}`,
          durationMs: Date.now() - startTime,
          retries: attempt
        };
      }

      attempt++;
      const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  return {
    status: 'retryable_error',
    data: null,
    output: `Failed after ${maxRetries} retries: ${lastError?.message || 'Transient failure'}`,
    durationMs: Date.now() - startTime,
    retries: attempt
  };
}

export function appendAuditLog({ tool, input, result, decision, durationMs }) {
  try {
    const filePath = getAuditLogPath();
    const inputHash = crypto.createHash('sha256').update(canonicalJson(input || {})).digest('hex');
    const resultSize = typeof result === 'string' ? Buffer.byteLength(result, 'utf8') : JSON.stringify(result || '').length;

    const record = {
      timestamp: Date.now(),
      tool,
      inputHash,
      resultSize,
      decision,
      status: result?.status || (decision === 'deny' ? 'denied' : 'ok'),
      durationMs: durationMs || 0
    };

    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
    return record;
  } catch (err) {
    console.warn('[Audit Log Warning]:', err.message);
    return null;
  }
}

export function getRecentAuditRecords(limit = 10) {
  try {
    const filePath = getAuditLogPath();
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
