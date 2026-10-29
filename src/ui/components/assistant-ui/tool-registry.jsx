import React from 'react';
import {
  // Tool Use & Execution Cards
  ToolCall,
  TerminalBlock,
  CodeDiff,
  ReviewableDiff,
  FileTree,
  ComputerUse,
  CodeRunner,
  ElicitationForm,
  McpServerPanel,
  ToolError,
  PermissionGrant,
  ToolFallback,
  // Reasoning & Messages
  GuardrailNotice,
  ConfidenceMarker,
  ReasoningEffort,
  StoppedRun,
  DaySeparator,
  SpeakerIdentity,
  // Phase 4: Agents & Observability
  AgentPlan,
  SubagentList,
  TaskCard,
  AgentStatus,
  ApprovalCard,
  OptionList,
  QuestionFlow,
  RecommendationCard,
  ArtifactCard,
  TodoList,
  AgentCard,
  AgentHandoff,
  BackgroundInbox,
  CheckpointHistory,
  ScheduleCard,
  TraceWaterfall,
  CostMeter,
  QuotaBanner,
  // Phase 5: Knowledge & Structured Output
  WebSearch,
  InlineCitation,
  LinkPreview,
  ImageGeneration,
  ImageGallery,
  RetrievalChunks,
  DocumentReference,
  MemoryChips,
  ResearchReport,
  MapAnswer,
  GeoMap,
  DataTable,
  NumberTicker,
  Chart,
  AudioPlayer,
  VideoPlayer,
  WebPreview,
  Diagram,
  FlowGraph,
  ActivityGraph,
  MathBlock,
  SpecSheet,
  ComparisonCard,
  Timeline,
  JobProgress,
  ScoreBreakdown,
  // Generative Cards
  GenerativeUI,
  GenerativeStays,
  GenerativeBooking,
  GenerativeOrderStatus,
  GenerativeFlightTracker,
  GenerativePortfolio,
  GenerativeCreateEvent,
  GenerativeViewEvent,
  GenerativeWeatherCurrent,
  GenerativeRideStatus,
  GenerativeDraftEmail,
  GenerativeCart,
  GenerativePlaylist,
  GenerativeChannelMessage,
  GenerativeReceipt,
  GenerativeChartArea,
  GenerativePlayerCard,
  GenerativeEventSession,
  GenerativeNotifyConfirm,
  GenerativeChartLine,
  GenerativeCreateTask,
  GenerativeSoftwarePurchase,
  GenerativeChartBars,
} from './elements';
import { FileSystemArtifact } from '../FileSystemArtifact';

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
 * Derive a concise human-readable activity label for RunActivity / ThinkingIndicator while a tool is running
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
    return 'Listing workspace files';
  }
  if (lower === 'file_search' || lower === 'search_files') {
    return `Searching files${args?.query ? ` for "${args.query}"` : ''}`;
  }
  if (lower === 'shell_run' || lower === 'run_command' || lower === 'bash') {
    const cmd = args?.command || args?.CommandLine || args?.cmd || '';
    if (typeof cmd === 'string' && cmd.includes('test')) return 'Running the tests';
    return cmd ? `Running ${String(cmd).slice(0, 48)}` : 'Running command';
  }
  if (lower === 'browser_search' || lower === 'web_search' || lower === 'search_web') {
    return args?.query ? `Searching web for "${args.query}"` : 'Searching the web';
  }
  if (lower === 'browser_read_page' || lower === 'read_page' || lower === 'read_url_content') {
    return args?.url ? `Reading ${args.url}` : 'Reading webpage';
  }
  if (lower === 'browser_action') {
    return args?.action ? `Performing browser ${args.action}` : 'Interacting with browser';
  }
  if (lower === 'snapshot_read' || lower === 'browser_screenshot') {
    return 'Inspecting live browser page';
  }
  if (lower.includes('plan') || lower === 'todo_list') {
    return 'Planning next steps';
  }
  if (lower.includes('subagent') || lower === 'invoke_subagent') {
    return 'Delegating to subagent';
  }
  if (
    lower === 'generate_image' ||
    lower === 'image_generation' ||
    lower === 'create_image' ||
    lower === 'edit_image'
  ) {
    return args?.prompt
      ? `Generating image: "${String(args.prompt).slice(0, 42)}"`
      : 'Generating image with Muse Image 1.0';
  }
  if (lower === 'ask_user' || lower === 'ask_question') {
    return args?.question
      ? `Asking: "${String(args.question).slice(0, 42)}"`
      : 'Waiting for your input';
  }
  return `Running ${toolName}`;
}

// ==========================================
// Explicit Specialized Element Tool Renderers
// ==========================================

registerToolComponent(
  ['generate_image', 'image_generation', 'create_image', 'edit_image'],
  ({ args, result, status }) => {
    const parsedResult =
      typeof result === 'string'
        ? (() => {
            try {
              return JSON.parse(result);
            } catch {
              return {};
            }
          })()
        : result || {};
    const prompt =
      args?.prompt ||
      parsedResult?.prompt ||
      args?.description ||
      'Generated image';
    const generating = status?.type === 'running';
    const imageUrl =
      parsedResult?.imageUrl ||
      parsedResult?.url ||
      args?.imageUrl ||
      args?.url;
    const sizeLabel = parsedResult?.size || args?.size || '1024x1024';

    return (
      <div className="my-1.5">
        <ImageGeneration
          prompt={String(prompt)}
          generating={generating}
          imageUrl={imageUrl}
          sizeLabel={sizeLabel}
        />
      </div>
    );
  }
);

registerToolComponent(
  [
    'file_read',
    'read_file',
    'view_file',
    'file_write',
    'write_file',
    'file_edit',
    'edit_file',
    'replace_file_content',
    'write_to_file'
  ],
  ({ toolName, args, result, part }) => {
    const rawPath = args?.path || args?.AbsolutePath || args?.TargetFile || args?.filename || args?.file || '';
    const cleanFilename = typeof rawPath === 'string' ? rawPath.split(/[/\\]/).pop() : 'file';
    const lower = (toolName || '').toLowerCase();
    const action =
      lower.includes('read') || lower.includes('view')
        ? 'viewed'
        : lower.includes('write')
          ? 'created'
          : 'single edit';
    const artifact = part?.fileArtifact || {
      path: rawPath,
      name: cleanFilename,
      action,
      content: typeof result === 'string' ? result : undefined
    };

    return (
      <div className="my-1.5">
        <FileSystemArtifact artifact={artifact} />
      </div>
    );
  }
);

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
      <AgentPlan
        title={planData.title || 'Plan'}
        steps={planData.steps || []}
        activeIndex={planData.activeIndex ?? 0}
      />
    </div>
  );
});

registerToolComponent(['web_search', 'search_web'], ({ args, result, status }) => {
  const query = args?.query || args?.q || 'Web search';
  const searching = status?.type === 'running';
  const rawItems = Array.isArray(result?.results)
    ? result.results
    : Array.isArray(result)
      ? result
      : [];
  const results = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      let domain = item.domain || item.source || '';
      if (!domain && item.url) {
        try {
          domain = new URL(item.url).hostname.replace(/^www\./, '');
        } catch {
          domain = String(item.url);
        }
      }
      return {
        title: item.title || item.name || item.url || 'Result',
        domain: domain || 'web'
      };
    })
    .filter(Boolean);

  if (!searching && results.length === 0) {
    return null; // Fall back to ToolFallback when plain text result is returned
  }

  return (
    <div className="my-1.5">
      <WebSearch
        query={String(query)}
        results={results}
        visibleResults={results.length}
        searching={searching}
        cycle={0}
      />
    </div>
  );
});

registerToolComponent(['subagent_list', 'invoke_subagent'], ({ args, result, status }) => {
  const rawList = Array.isArray(args?.Subagents)
    ? args.Subagents
    : Array.isArray(args?.agents)
      ? args.agents
      : [];
  if (rawList.length === 0) return null;
  const agents = rawList.map((a) => ({
    name: a.Role || a.name || a.TypeName || 'Subagent',
    model: a.Model || a.model || 'inherit'
  }));
  const doneCount = status?.type === 'running' ? 0 : agents.length;
  return (
    <div className="my-1.5">
      <SubagentList
        agents={agents}
        completedCount={doneCount}
        progress={agents.map((_, i) => (i < doneCount ? 100 : 60))}
        showSummary={false}
        summaryAgent={{ name: 'Synthesizing results', model: 'omni' }}
      />
    </div>
  );
});

registerToolComponent(['ask_question', 'question_flow'], ({ args }) => {
  const questions = Array.isArray(args?.questions) ? args.questions : [];
  if (questions.length === 0) return null;
  const steps = questions.map((q, idx) => ({
    id: q.id || `q-${idx}`,
    question: q.question || 'Question',
    description: q.description,
    selectionMode: q.is_multi_select ? 'multiple' : 'single',
    options: (q.options || []).map((opt, oIdx) =>
      typeof opt === 'string' ? { id: `opt-${oIdx}`, label: opt } : opt
    )
  }));
  return (
    <div className="my-1.5">
      <QuestionFlow steps={steps} />
    </div>
  );
});

// ==========================================
// Default Data Part Renderers (All 14 Categories)
// ==========================================

const DIRECT_DATA_MAP = {
  // Phase 2 & 3
  code_diff: CodeDiff,
  reviewable_diff: ReviewableDiff,
  file_tree: FileTree,
  terminal: TerminalBlock,
  terminal_block: TerminalBlock,
  computer_use: ComputerUse,
  code_runner: CodeRunner,
  guardrail: GuardrailNotice,
  guardrail_notice: GuardrailNotice,
  confidence: ConfidenceMarker,
  confidence_marker: ConfidenceMarker,
  reasoning_effort: ReasoningEffort,
  stopped_run: StoppedRun,
  day_separator: DaySeparator,
  speaker_identity: SpeakerIdentity,
  elicitation_form: ElicitationForm,
  mcp_server_panel: McpServerPanel,
  tool_error: ToolError,
  permission_grant: PermissionGrant,
  // Phase 4: Agents & Observability
  subagent_list: SubagentList,
  task_card: TaskCard,
  agent_status: AgentStatus,
  approval_card: ApprovalCard,
  option_list: OptionList,
  question_flow: QuestionFlow,
  recommendation_card: RecommendationCard,
  artifact_card: ArtifactCard,
  todo_list: TodoList,
  agent_card: AgentCard,
  agent_handoff: AgentHandoff,
  background_inbox: BackgroundInbox,
  checkpoint_history: CheckpointHistory,
  schedule_card: ScheduleCard,
  trace_waterfall: TraceWaterfall,
  cost_meter: CostMeter,
  quota_banner: QuotaBanner,
  // Phase 5: Knowledge & Structured Output
  web_search: WebSearch,
  inline_citation: InlineCitation,
  link_preview: LinkPreview,
  image_generation: ImageGeneration,
  image_gallery: ImageGallery,
  retrieval_chunks: RetrievalChunks,
  document_reference: DocumentReference,
  memory_chips: MemoryChips,
  research_report: ResearchReport,
  map_answer: MapAnswer,
  geo_map: GeoMap,
  data_table: DataTable,
  number_ticker: NumberTicker,
  chart: Chart,
  audio_player: AudioPlayer,
  video_player: VideoPlayer,
  media_player: AudioPlayer,
  web_preview: WebPreview,
  diagram: Diagram,
  flow_graph: FlowGraph,
  activity_graph: ActivityGraph,
  math_block: MathBlock,
  spec_sheet: SpecSheet,
  comparison_card: ComparisonCard,
  timeline: Timeline,
  job_progress: JobProgress,
  score_breakdown: ScoreBreakdown,
  // Phase 6: Generative Presets
  generative_ui: GenerativeUI,
  generative_stays: GenerativeStays,
  generative_booking: GenerativeBooking,
  generative_order_status: GenerativeOrderStatus,
  generative_flight_tracker: GenerativeFlightTracker,
  generative_portfolio: GenerativePortfolio,
  generative_create_event: GenerativeCreateEvent,
  generative_view_event: GenerativeViewEvent,
  generative_weather_current: GenerativeWeatherCurrent,
  generative_ride_status: GenerativeRideStatus,
  generative_draft_email: GenerativeDraftEmail,
  generative_cart: GenerativeCart,
  generative_playlist: GenerativePlaylist,
  generative_channel_message: GenerativeChannelMessage,
  generative_receipt: GenerativeReceipt,
  generative_chart_area: GenerativeChartArea,
  generative_player_card: GenerativePlayerCard,
  generative_event_session: GenerativeEventSession,
  generative_notify_confirm: GenerativeNotifyConfirm,
  generative_chart_line: GenerativeChartLine,
  generative_create_task: GenerativeCreateTask,
  generative_software_purchase: GenerativeSoftwarePurchase,
  generative_chart_bars: GenerativeChartBars,
};

registerDataRenderer(['file_artifact', 'file-artifact', 'file_system', 'file-system'], (data) => {
  const artifact = data?.data || data?.artifact || data;
  return (
    <div className="my-1.5">
      <FileSystemArtifact artifact={artifact} />
    </div>
  );
});

registerDataRenderer(['plan', 'agent_plan', 'agent-plan'], (data) => {
  const planData = data.data || data;
  return (
    <div className="my-2">
      <AgentPlan
        title={planData.title || 'Plan'}
        steps={planData.steps || []}
        activeIndex={planData.activeIndex ?? 0}
      />
    </div>
  );
});

for (const [key, Comp] of Object.entries(DIRECT_DATA_MAP)) {
  const hyphenKey = key.replace(/_/g, '-');
  registerDataRenderer([key, hyphenKey], (data) => (
    <div className="my-2">
      <Comp {...(data.data || data)} />
    </div>
  ));
}

// ==========================================
// Main Dispatchers
// ==========================================

/**
 * Render any tool-call part using the registered specialized component or official ToolFallback
 */
export function renderToolCallPart(part, options = {}) {
  const toolName = (part.toolName || part.name || 'tool').toLowerCase();
  const args = part.args || part.arguments;
  const renderer = options.forceFallback ? null : toolRenderers.get(toolName);

  if (renderer) {
    try {
      const rendered = renderer({
        toolName: part.toolName || part.name,
        args,
        result: part.result,
        status: part.status,
        part,
        ...options
      });
      if (rendered) return rendered;
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
      active={options.active}
      open={options.open}
      onOpenChange={options.onOpenChange}
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
        <AgentPlan
          title={pData.title || 'Plan'}
          steps={pData.steps || []}
          activeIndex={pData.activeIndex ?? 0}
        />
      </div>
    );
  }

  return part.dataRendererUI || null;
}
