/**
 * registries.js
 *
 * Code-enforced per-level tool registries and permission gates for Omni's
 * multi-level form-filling and web-task architecture.
 *
 * Levels:
 * - browser_subagent (Level 1): ONLY browser tools. No BIO tools, no shell, no file writes.
 * - extractor (Level 2A): Code only, no model, no tools.
 * - reader (Level 2B): Toolless model call (tools: []). No BIO, no browser, no commands, no sandbox.
 * - comparator (Level 2C): Code only, no model, no tools.
 * - planner (Level 3): Active-profile BIO read tools ONLY (when bioAccess.read === true).
 *   No browser tools, no network, no shell, no send/write tools.
 * - executor (Level 1 code executor): Executes validated Fill Plan inside Level 1 sandbox.
 * - reviewer (Level 4): Toolless model call (tools: []). Sees only user request, active profile name,
 *   proposed action, and deterministic injection scanner warnings.
 */

import { AGENT_TOOLS_CATALOG } from '../tools/catalog.js';

export const LEVEL_BROWSER_TOOL_NAMES = Object.freeze([
  'browser_read_page',
  'read_page',
  'page_snapshot',
  'notes_read',
  'notes_write',
  'sandbox_run_script',
  'browser_action',
  'snapshot_read',
  'browser_screenshot',
  'browser_screenshot_vision',
  'browser_search',
  'web_search'
]);

export const LEVEL_PLANNER_BIO_READ_TOOL_NAMES = Object.freeze([
  'bio_index',
  'bio_search',
  'bio_get',
  'process_document',
  'process_image',
  'process_audio',
  'process_video'
]);

/**
 * Return the code-enforced tool declaration array for a given level.
 */
export function getLevelToolRegistry(level, { bioAccess = null } = {}) {
  const norm = String(level || '').trim().toLowerCase();

  if (norm === 'browser_subagent' || norm === 'level1_browser') {
    return Object.freeze(
      LEVEL_BROWSER_TOOL_NAMES.map((name) => AGENT_TOOLS_CATALOG[name]).filter(Boolean)
    );
  }

  if (norm === 'reader' || norm === 'level2b_reader') {
    return Object.freeze([]);
  }

  if (norm === 'extractor' || norm === 'level2a_extractor' || norm === 'comparator' || norm === 'level2c_comparator') {
    return Object.freeze([]);
  }

  if (norm === 'planner' || norm === 'level3_planner') {
    if (!bioAccess || !bioAccess.userId || !bioAccess.profileId || bioAccess.read !== true) {
      return Object.freeze([]);
    }
    return Object.freeze(
      LEVEL_PLANNER_BIO_READ_TOOL_NAMES.map((name) => AGENT_TOOLS_CATALOG[name]).filter(Boolean)
    );
  }

  if (norm === 'reviewer' || norm === 'level4_reviewer') {
    return Object.freeze([]);
  }

  throw new Error(`Unknown execution level "${level}".`);
}

/**
 * Assert in code whether a level is permitted to invoke a tool.
 * Returns { allowed: true } or { allowed: false, code, error }.
 */
export function checkLevelToolAccess(level, toolName, { bioAccess = null, toolArgs = {} } = {}) {
  const normLevel = String(level || '').trim().toLowerCase();
  const normTool = String(toolName || '').trim();

  if (normLevel === 'reader' || normLevel === 'level2b_reader') {
    return {
      allowed: false,
      code: 'LEVEL_TOOL_DENIED',
      error: `Refused: Level 2B Reader is strictly toolless and cannot invoke "${normTool}" or run any command.`
    };
  }

  if (normLevel === 'reviewer' || normLevel === 'level4_reviewer') {
    return {
      allowed: false,
      code: 'LEVEL_TOOL_DENIED',
      error: `Refused: Level 4 Reviewer is strictly toolless and cannot invoke "${normTool}".`
    };
  }

  if (normLevel === 'extractor' || normLevel === 'comparator') {
    return {
      allowed: false,
      code: 'LEVEL_TOOL_DENIED',
      error: `Refused: Level "${normLevel}" is deterministic code and cannot invoke model tools ("${normTool}").`
    };
  }

  if (normLevel === 'browser_subagent' || normLevel === 'level1_browser') {
    if (!LEVEL_BROWSER_TOOL_NAMES.includes(normTool)) {
      return {
        allowed: false,
        code: 'LEVEL_TOOL_DENIED',
        error: `Refused: Level 1 Browser Subagent may ONLY call browser tools (${LEVEL_BROWSER_TOOL_NAMES.join(', ')}). Attempted to call "${normTool}".`
      };
    }
    return { allowed: true };
  }

  if (normLevel === 'planner' || normLevel === 'level3_planner') {
    if (!LEVEL_PLANNER_BIO_READ_TOOL_NAMES.includes(normTool)) {
      return {
        allowed: false,
        code: 'LEVEL_TOOL_DENIED',
        error: `Refused: Level 3 Planner has ONLY BIO read tools (${LEVEL_PLANNER_BIO_READ_TOOL_NAMES.join(', ')}). Browser, network, shell, and write tool "${normTool}" is forbidden.`
      };
    }
    if (!bioAccess || !bioAccess.userId || !bioAccess.profileId) {
      return {
        allowed: false,
        code: 'LEVEL_BIO_DENIED',
        error: `Refused: Level 3 Planner cannot call "${normTool}" because no active BIO profile is bound to this run.`
      };
    }
    if (bioAccess.read !== true) {
      return {
        allowed: false,
        code: 'LEVEL_BIO_DENIED',
        error: `Refused: Level 3 Planner cannot call "${normTool}" because the active BIO profile's Read switch is OFF.`
      };
    }
    const requestedProfileId = toolArgs?.profile_id || toolArgs?.profileId || null;
    if (requestedProfileId && requestedProfileId !== bioAccess.profileId) {
      return {
        allowed: false,
        code: 'LEVEL_BIO_DENIED',
        error: `Refused: Level 3 Planner attempted to read non-active BIO profile "${requestedProfileId}" (active profile is "${bioAccess.profileId}").`
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    code: 'LEVEL_UNKNOWN',
    error: `Refused: Unknown level "${level}" attempted to call "${normTool}".`
  };
}

/**
 * Execute a tool on behalf of a specific level, enforcing the level's registry in code.
 */
export async function executeLevelTool({
  level,
  toolName,
  toolArgs = {},
  context = {},
  executor
}) {
  const access = checkLevelToolAccess(level, toolName, {
    bioAccess: context.bioAccess,
    toolArgs
  });

  if (!access.allowed) {
    const err = new Error(access.error);
    err.code = access.code;
    err.level = level;
    err.toolName = toolName;
    throw err;
  }

  if (typeof executor !== 'function') {
    throw new Error(`No executor callback supplied for tool "${toolName}" in level "${level}".`);
  }

  return await executor(toolName, toolArgs, context);
}
