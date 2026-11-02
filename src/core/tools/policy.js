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
    'bio_search',
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

  if (normTool === 'browser_read_page' || normTool === 'read_page') {
    const rawUrl = String(args.url || '').trim();
    if (/^https?:\/\//i.test(rawUrl)) {
      const targetHost = hostOf(rawUrl);
      const isLocal = targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost.includes('local');
      const approvalSet = approvals instanceof Set ? approvals : new Set(Array.isArray(approvals) ? approvals : Object.keys(approvals || {}));
      const alreadyApproved =
        isLocal ||
        approvalSet.has(targetHost) ||
        approvalSet.has(`host:${targetHost}`) ||
        approvalSet.has(normTool) ||
        approvalSet.has('*') ||
        (context?.navigation?.approvedHosts && isApprovedHost(targetHost, context.navigation.approvedHosts)) ||
        Boolean(context?.navigation?.userApproved);

      if (!alreadyApproved) {
        return {
          decision: 'ask',
          reason: `May I visit and inspect the site on ${targetHost}?`,
          options: ['(Recommended) Allow and proceed', 'Deny']
        };
      }
    }
  }

  if (normTool === 'browser_action') {
    const target = String(args.selectorOrText || '').toLowerCase().trim();
    const actionType = String(args.action || '').toLowerCase().trim();
    if (target.includes('password') || target.includes('credit') || target.includes('cvv')) {
      return {
        decision: 'ask',
        reason: `Interacting with sensitive field "${args.selectorOrText}" requires human confirmation`
      };
    }
    if (actionType === 'click' && target) {
      const isIntermediateStep =
        /\b(next|continue|proceed|step\s*\d+|back|previous|save\s+draft)\b/i.test(target) &&
        !/\bsubmit\b/i.test(target);
      const isFinalSubmit =
        !isIntermediateStep &&
        (/\b(submit|send\s+application|complete\s+application|finish\s+application|apply\s+now)\b/i.test(target) ||
          /\[type=["']?submit["']?\]/i.test(target));
      if (isFinalSubmit) {
        const normMode = String(mode || 'turbo').toLowerCase();
        const fillOnlyIntent = Boolean(context?.navigation?.fillOnlyIntent);
        const explicitGoAhead = Boolean(context?.navigation?.explicitGoAhead) && !fillOnlyIntent;
        const isHighRiskApp =
          Boolean(context?.navigation?.isHighRiskApplication) ||
          /\b(wire\s+transfer|bank\s+transfer|payment|binding\s+legal|tax\s+filing|loan\s+application|credit\s+application|legally\s+binding|non-refundable|financial\s+commitment)\b/i.test(
            target
          );
        if (fillOnlyIntent || normMode === 'review' || normMode === 'request_review') {
          return {
            decision: 'ask',
            reason: `Final submission ("${args.selectorOrText}") requires user confirmation before submitting the form.`
          };
        }
        if (!explicitGoAhead && (normMode === 'default' || normMode === 'confirm' || isHighRiskApp)) {
          return {
            decision: 'ask',
            reason: `Final submission ("${args.selectorOrText}") requires user confirmation before submitting the form.`
          };
        }
      }
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
    'page_snapshot',
    'notes_read',
    'snapshot_read',
    'browser_screenshot',
    'browser_screenshot_vision',
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
    'page_snapshot',
    'notes_read',
    'notes_write',
    'sandbox_run_script',
    'browser_action',
    'file_read',
    'file_list',
    'file_search',
    'file_write',
    'file_edit',
    'profile_get',
    'snapshot_read',
    'browser_screenshot',
    'browser_screenshot_vision',
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

/** Hosts treated as trusted work surfaces (plus any URL the user provided). */
export const TRUSTED_JOB_HOSTS = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'greenhouse.io',
  'lever.co',
  'ziprecruiter.com',
  'dice.com',
  'wellfound.com',
  'remoteok.com',
  'weworkremotely.com'
];

export function hostOf(url) {
  try {
    return new URL(String(url || '')).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isApprovedHost(host, approvedHosts) {
  const h = String(host || '').replace(/^www\./, '');
  if (!h) return false;
  const set = approvedHosts instanceof Set ? approvedHosts : new Set(approvedHosts || []);
  if (set.has(h)) return true;
  for (const approved of set) {
    if (approved && h.endsWith(`.${approved}`)) return true;
  }
  return false;
}

/** Approved hosts = trusted job boards + every host the user themselves named. */
export function collectApprovedHosts(texts = []) {
  const hosts = new Set(TRUSTED_JOB_HOSTS);
  for (const text of texts) {
    const matches = String(text || '').match(/https?:\/\/([a-z0-9.-]+)/gi) || [];
    for (const m of matches) {
      const h = hostOf(m);
      if (h) hosts.add(h);
    }
  }
  return hosts;
}

/**
 * Data-movement guard for browser actions (prompt-injection exfiltration
 * defense): uploading files, or typing the user's BIO data, toward a host
 * that is neither approved nor part of user-requested form work requires
 * human approval. Returns null when the action may proceed.
 */
export function evaluateBrowserDataAction({
  action,
  currentHost,
  approvedHosts,
  formWorkApproved,
  bioValueMatch
} = {}) {
  const act = String(action || '').toLowerCase();
  const approved =
    !!formWorkApproved || (!!currentHost && isApprovedHost(currentHost, approvedHosts));
  if (act === 'upload') {
    if (approved) return null;
    return {
      decision: 'ask',
      reason: `Uploading a file to ${currentHost || 'this site'} requires your approval (the site is not in the approved list and the request did not ask for form work).`
    };
  }
  if (act === 'type' && bioValueMatch) {
    if (approved) return null;
    return {
      decision: 'ask',
      reason: `Sending your BIO data to ${currentHost || 'this site'} requires your approval (the site is not in the approved list).`
    };
  }
  return null;
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
