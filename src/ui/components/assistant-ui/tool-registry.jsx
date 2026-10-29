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
 * Maps tool call names to specialized 1:1 assistant-ui components.
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

// ==========================================
// Default Tool Renderers
// ==========================================

// Terminal & Shell Execution tools
registerToolComponent(
  ['shell_run', 'shell_output', 'bash', 'terminal', 'run_command', 'execute_command', 'cmd_run'],
  ({ toolName, args, result, status }) => {
    const cmd =
      (args && typeof args === 'object'
        ? args.command || args.CommandLine || args.cmd || args.stepTitle
        : args) || toolName;
    const outputStr = result
      ? typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2)
      : '';
    const outputLines = outputStr ? outputStr.split('\n').filter(Boolean) : [];
    const state =
      status?.type === 'running'
        ? 'running'
        : status?.type === 'error'
        ? 'failed'
        : 'done';

    return (
      <div className="my-2">
        <TerminalBlock
          command={typeof cmd === 'string' ? cmd : JSON.stringify(cmd)}
          state={state}
          output={outputLines.slice(0, 10)}
        />
      </div>
    );
  }
);

// Code Edit & Diff tools
registerToolComponent(
  ['file_edit', 'edit_file', 'replace_file_content', 'code_diff', 'patch_file'],
  ({ toolName, args, result, status }) => {
    const filename =
      (args && typeof args === 'object'
        ? args.path || args.TargetFile || args.filename || args.filePath
        : 'code') || 'file';
    const oldCode = args?.old_text || args?.TargetContent || '';
    const newCode = args?.new_text || args?.ReplacementContent || '';
    const cleanName = typeof filename === 'string' ? filename.split(/[/\\]/).pop() : 'edit';

    return (
      <div className="my-2">
        <CodeDiff
          filename={cleanName}
          oldCode={oldCode}
          newCode={newCode}
        />
      </div>
    );
  }
);

// File Tree / File List tools
registerToolComponent(
  ['file_list', 'list_files', 'workspace_files', 'dir_list', 'directory_list'],
  ({ toolName, args, result, status }) => {
    let files = [];
    if (result && Array.isArray(result)) {
      files = result;
    } else if (result && typeof result === 'object' && Array.isArray(result.files)) {
      files = result.files;
    } else if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) files = parsed;
        else if (Array.isArray(parsed.files)) files = parsed.files;
      } catch {}
    }

    const title = (args && typeof args === 'object' && args.path) ? args.path : 'Workspace Files';

    if (files.length > 0) {
      return (
        <div className="my-2">
          <FileTree title={title} files={files} />
        </div>
      );
    }

    return (
      <div className="my-1.5">
        <ToolCall
          toolName="file_list"
          completedName="file_list"
          argument={args ? (typeof args === 'string' ? args : JSON.stringify(args).slice(0, 50)) : ''}
          result={result}
          isComplete={status?.type !== 'running'}
        />
      </div>
    );
  }
);

// Browser Action & Computer Use tools
registerToolComponent(
  ['browser_action', 'computer_use', 'mouse_click', 'keyboard_type'],
  ({ toolName, args, result, status }) => {
    const action = args?.action || 'Interact';
    const target = args?.selectorOrText || args?.stepTitle || '';
    return (
      <div className="my-2">
        <ComputerUse
          action={action}
          target={target}
          status={status?.type === 'running' ? 'running' : 'done'}
          screenshot={result?.screenshot}
        />
      </div>
    );
  }
);

// Code Runner tools
registerToolComponent(
  ['code_runner', 'run_code', 'eval_code', 'python_run', 'node_run'],
  ({ toolName, args, result, status }) => {
    const code = args?.code || (typeof args === 'string' ? args : '');
    const language = args?.language || 'javascript';
    return (
      <div className="my-2">
        <CodeRunner
          code={code}
          language={language}
          output={typeof result === 'string' ? result : JSON.stringify(result)}
          status={status?.type === 'running' ? 'running' : 'done'}
        />
      </div>
    );
  }
);

// MCP tools
registerToolComponent(
  ['call_mcp_tool', 'mcp_tool', 'mcp_server'],
  ({ toolName, args, result, status }) => {
    const serverName = args?.ServerName || args?.server || 'mcp';
    const tool = args?.ToolName || args?.tool || toolName;
    return (
      <div className="my-2">
        <McpServerPanel
          serverName={serverName}
          toolName={tool}
          status={status?.type === 'running' ? 'connecting' : 'active'}
        />
      </div>
    );
  }
);

// Permission Grant tools
registerToolComponent(
  ['file_delete', 'delete_file', 'request_permission', 'grant_permission'],
  ({ toolName, args, result, status }) => {
    const title = args?.stepTitle || `Permission requested: ${toolName}`;
    const description = args?.path ? `Target path: ${args.path}` : JSON.stringify(args || {});
    return (
      <div className="my-2">
        <PermissionGrant
          title={title}
          description={description}
        />
      </div>
    );
  }
);

// ==========================================
// Default Data Part Renderers
// ==========================================

registerDataRenderer(['plan', 'agent_plan'], (data) => {
  const planData = data.data || data;
  return (
    <div className="my-2">
      <AgentPlan title={planData.title || 'Plan'} steps={planData.steps || []} />
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
 * Render any tool-call part using the registered specialized component or ToolCall fallback
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

  // Universal Fallback: Collapsible 1:1 ToolCall card
  const argDisplay = args
    ? typeof args === 'string'
      ? args
      : (args.stepTitle || JSON.stringify(args).slice(0, 45))
    : '';

  return (
    <div className="my-1.5">
      <ToolCall
        toolName={part.toolName || part.name || 'tool'}
        completedName={part.toolName || part.name || 'tool'}
        argument={argDisplay}
        result={part.result}
        isComplete={part.status?.type !== 'running'}
      />
    </div>
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

  // If part has steps, it's an AgentPlan
  if (part.data?.steps || part.steps) {
    const pData = part.data || part;
    return (
      <div className="my-2">
        <AgentPlan title={pData.title || 'Plan'} steps={pData.steps || []} />
      </div>
    );
  }

  return part.dataRendererUI || null;
}
