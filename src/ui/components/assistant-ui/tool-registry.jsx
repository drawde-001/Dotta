import React from 'react';
import {
  ToolCall,
  TerminalBlock,
  CodeDiff,
  ReviewableDiff,
  FileTree,
  ComputerUse,
  CodeRunner,
  AgentPlan,
  ElicitationForm,
  McpServerPanel,
  ToolError,
  PermissionGrant,
  GuardrailNotice,
  ConfidenceMarker,
  ReasoningEffort,
  StoppedRun,
  DaySeparator,
  SpeakerIdentity,
  ToolFallback
} from './elements';

/**
 * Tool to Component Registry
 * Maps explicit UI element tool names to specialized 1:1 assistant-ui components.
 */
const toolRenderers = new Map();

/**
 * Data to Component Registry
 * Maps custom part / data names to specialized 1:1 assistant-ui components.
 */
const dataRenderers = new Map();

/**
 * Register a custom tool component renderer
 */
export function registerToolComponent(toolName, renderer) {
  if (Array.isArray(toolName)) {
    toolName.forEach((name) => toolRenderers.set(name.toLowerCase(), renderer));
  } else {
    toolRenderers.set(toolName.toLowerCase(), renderer);
  }
}

/**
 * Register a custom data component renderer
 */
export function registerDataRenderer(dataName, renderer) {
  if (Array.isArray(dataName)) {
    dataName.forEach((name) => dataRenderers.set(name.toLowerCase(), renderer));
  } else {
    dataRenderers.set(dataName.toLowerCase(), renderer);
  }
}

/**
 * Derive a concise human-readable activity label for RunActivity while a tool is running
 */
export function getToolActivityLabel(part) {
  const toolName = String(part?.toolName || part?.name || 'tool');
  const lower = toolName.toLowerCase();
  const args = part?.args || part?.arguments || {};

  if (args && typeof args === 'object' && args.stepTitle) {
    return String(args.stepTitle);
  }

  if (lower === 'file_read' || lower === 'read_file' || lower === 'view_file') {
    const file = args?.path || args?.file || args?.filename || '';
    const base = typeof file === 'string' && file ? file.split(/[/\\]/).pop() : 'files';
    return `Reading ${base}`;
  }
  if (lower === 'file_write' || lower === 'write_file' || lower === 'file_edit' || lower === 'edit_file') {
    const file = args?.path || args?.file || args?.filename || '';
    const base = typeof file === 'string' && file ? file.split(/[/\\]/).pop() : 'file';
    return `Updating ${base}`;
  }
  if (lower === 'file_list' || lower === 'list_files') {
    return `Listing workspace files`;
  }
  if (lower === 'file_search' || lower === 'search_files') {
    return `Searching files${args?.query ? ` for "${args.query}"` : ''}`;
  }
  if (lower === 'shell_run' || lower === 'run_command' || lower === 'bash') {
    const cmd = args?.command || args?.CommandLine || args?.cmd || '';
    if (typeof cmd === 'string' && cmd.includes('test')) return 'Running the tests';
    return cmd ? `Running ${String(cmd).slice(0, 48)}` : 'Running command';
  }
  if (lower === 'browser_search' || lower === 'web_search') {
    return args?.query ? `Searching web for "${args.query}"` : 'Searching the web';
  }
  if (lower === 'browser_read_page' || lower === 'read_page') {
    return args?.url ? `Reading ${args.url}` : 'Reading webpage';
  }
  if (lower === 'browser_action') {
    return args?.action ? `Performing browser ${args.action}` : 'Interacting with browser';
  }
  if (lower === 'snapshot_read' || lower === 'browser_screenshot') {
    return 'Inspecting live browser page';
  }
  return `Running ${toolName}`;
}

// ==========================================
// Explicit Specialized Element Tool Renderers
// ==========================================

registerToolComponent(['code_diff', 'patch_preview'], ({ args }) => {
  const filename = args?.path || args?.filename || 'file';
  const cleanName = typeof filename === 'string' ? filename.split(/[/\\]/).pop() : 'edit';
  return (
    <div className="my-1.5">
      <CodeDiff
        filename={cleanName}
        oldCode={args?.old_text || args?.oldCode || ''}
        newCode={args?.new_text || args?.newCode || ''}
      />
    </div>
  );
});

registerToolComponent(['agent_plan', 'create_plan'], ({ args, result }) => {
  const planData = result || args || {};
  return (
    <div className="my-1.5">
      <AgentPlan title={planData.title || 'Plan'} steps={planData.steps || []} activeIndex={planData.activeIndex ?? 0} />
    </div>
  );
});

// ==========================================
// Default Data Part Renderers
// ==========================================

registerDataRenderer(['plan', 'agent_plan'], (data) => {
  const planData = data.data || data;
  return (
    <div className="my-2">
      <AgentPlan title={planData.title || 'Plan'} steps={planData.steps || []} activeIndex={planData.activeIndex ?? 0} />
    </div>
  );
});

registerDataRenderer('code_diff', (data) => (
  <div className="my-2">
    <CodeDiff {...(data.data || data)} />
  </div>
));

registerDataRenderer('reviewable_diff', (data) => (
  <div className="my-2">
    <ReviewableDiff {...(data.data || data)} />
  </div>
));

registerDataRenderer('file_tree', (data) => (
  <div className="my-2">
    <FileTree {...(data.data || data)} />
  </div>
));

registerDataRenderer('terminal', (data) => (
  <div className="my-2">
    <TerminalBlock {...(data.data || data)} />
  </div>
));

registerDataRenderer('guardrail', (data) => (
  <div className="my-2">
    <GuardrailNotice {...(data.data || data)} />
  </div>
));

registerDataRenderer('confidence', (data) => (
  <div className="my-2">
    <ConfidenceMarker {...(data.data || data)} />
  </div>
));

registerDataRenderer('reasoning_effort', (data) => (
  <div className="my-2">
    <ReasoningEffort {...(data.data || data)} />
  </div>
));

registerDataRenderer('stopped_run', (data) => (
  <div className="my-2">
    <StoppedRun {...(data.data || data)} />
  </div>
));

registerDataRenderer('day_separator', (data) => (
  <div className="my-2">
    <DaySeparator {...(data.data || data)} />
  </div>
));

registerDataRenderer('speaker_identity', (data) => (
  <div className="my-2">
    <SpeakerIdentity {...(data.data || data)} />
  </div>
));

registerDataRenderer('elicitation_form', (data) => (
  <div className="my-2">
    <ElicitationForm {...(data.data || data)} />
  </div>
));

// ==========================================
// Main Dispatchers
// ==========================================

/**
 * Render any tool-call part using the registered specialized component or official ToolFallback
 */
export function renderToolCallPart(part) {
  const toolName = (part.toolName || part.name || 'tool').toLowerCase();
  const args = part.args || part.arguments;
  const renderer = toolRenderers.get(toolName);

  if (renderer) {
    try {
      return renderer({
        toolName: part.toolName || part.name,
        args,
        result: part.result,
        status: part.status,
        part
      });
    } catch (err) {
      console.warn(`[ToolRegistry] Renderer for ${toolName} threw:`, err);
    }
  }

  return (
    <ToolFallback
      toolName={part.toolName || part.name || 'tool'}
      args={args}
      argsText={part.argsText}
      result={part.result}
      status={part.status}
      elapsedMs={part.elapsedMs}
    />
  );
}

/**
 * Render any data part using the registered specialized component
 */
export function renderDataPart(part) {
  const name = (part.name || '').toLowerCase();
  const renderer = dataRenderers.get(name);

  if (renderer) {
    try {
      return renderer(part);
    } catch (err) {
      console.warn(`[ToolRegistry] Data renderer for ${name} threw:`, err);
    }
  }

  if (part.data?.steps || part.steps) {
    const pData = part.data || part;
    return (
      <div className="my-2">
        <AgentPlan title={pData.title || 'Plan'} steps={pData.steps || []} activeIndex={pData.activeIndex ?? 0} />
      </div>
    );
  }

  return part.dataRendererUI || null;
}
