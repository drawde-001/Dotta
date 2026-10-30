import React, { useState, useRef, useCallback } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUp,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDown,
  ChevronRight,
  CopyIcon,
  DownloadIcon,
  LoaderIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  Square,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Plus,
  Paperclip,
  ScrollText,
  LayoutGrid,
  Puzzle,
  Sparkles,
  Zap,
  GlobeIcon,
  SearchIcon,
  MousePointerClickIcon,
  FileIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import "@assistant-ui/react-markdown/styles/dot.css";

import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/elements/attachment.aui";
import { Reasoning, ReasoningRoot, ReasoningTrigger, ReasoningContent, ReasoningText } from "@/components/assistant-ui/elements/reasoning.aui";
import { Sources } from "@/components/assistant-ui/elements/sources.aui";
import {
  ThinkingIndicator,
  TypingIndicator,
  RunActivity,
  ToolCall,
  TerminalBlock,
  CodeDiff,
  ReviewableDiff,
  FileTree,
  AgentPlan,
  GuardrailNotice,
  ConfidenceMarker,
  ReasoningEffort,
  ErrorState,
  ToolTimeline,
} from "@/components/assistant-ui/elements";
import { AskUserInterruptCard } from "@/components/AskUserInterruptCard";
import { SubmittedAskUserCard } from "@/components/SubmittedAskUserCard";
import {
  renderToolCallPart,
  renderDataPart,
  getToolActivityLabel,
  registerToolComponent,
  registerDataRenderer,
} from "./tool-registry";
import { cn } from "@/lib/utils";

export { registerToolComponent, registerDataRenderer };

export function Thread({ activeInterrupt, onResolveInterrupt, selectedModel = 'meta-muse-spark', onSelectModel, showComposer = false }) {
  const isEmpty = useAuiState((s) => s.thread.isEmpty);

  return (
    <ThreadPrimitive.Root
      className="flex h-full flex-col bg-background text-foreground text-sm"
      style={{
        "--thread-max-width": "46rem",
        "--composer-radius": "1.25rem",
        "--composer-padding": "8px",
        "--composer-bg": "transparent",
        "--accent-color": "var(--aui-accent)",
        "--accent-foreground": "var(--aui-accent-foreground)",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-[var(--thread-max-width)] flex-1 flex-col px-4 pt-4",
            isEmpty && "justify-center",
          )}
        >
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div className="mb-6 flex flex-col gap-y-6 empty:hidden">
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                EditComposer,
                AssistantMessage,
              }}
            />
          </div>

          {showComposer && (
            <ThreadPrimitive.ViewportFooter
              className={cn(
                "flex w-full flex-col gap-4 overflow-visible bg-background pb-4",
                !isEmpty && "sticky bottom-0 mt-auto rounded-t-[var(--composer-radius)]",
              )}
            >
              <ThreadScrollToBottom />
              <Composer
                activeInterrupt={activeInterrupt}
                onResolveInterrupt={onResolveInterrupt}
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
              />
              <AuiIf condition={(s) => s.thread.isEmpty && s.composer.isEmpty}>
                <ThreadSuggestions />
              </AuiIf>
            </ThreadPrimitive.ViewportFooter>
          )}
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function ThreadWelcome() {
  return (
    <div className="mb-6 flex flex-col px-2">
      <p className="text-2xl font-medium tracking-tight fade-in slide-in-from-bottom-1 animate-in fill-mode-both duration-200">
        How can I help you today?
      </p>
    </div>
  );
}

function ThreadSuggestions() {
  return (
    <div className="flex w-full flex-col">
      <ThreadPrimitive.Suggestion prompt="Check online for engineering jobs" send asChild>
        <button type="button" className="group hover:bg-foreground/[0.03] focus-visible:ring-ring/50 flex w-full items-baseline gap-2.5 rounded-md px-2 py-2 text-start text-sm transition-colors outline-none focus-visible:ring-1 motion-reduce:transition-none cursor-pointer">
          <span aria-hidden className="text-muted-foreground/60 group-hover:text-foreground font-mono text-xs transition-colors motion-reduce:transition-none">{">"}</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="text-foreground">Check online for</span>{" "}
            <span className="text-muted-foreground">engineering jobs</span>
          </span>
        </button>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion prompt="Search for latest tech news" send asChild>
        <button type="button" className="group hover:bg-foreground/[0.03] focus-visible:ring-ring/50 flex w-full items-baseline gap-2.5 rounded-md px-2 py-2 text-start text-sm transition-colors outline-none focus-visible:ring-1 motion-reduce:transition-none cursor-pointer">
          <span aria-hidden className="text-muted-foreground/60 group-hover:text-foreground font-mono text-xs transition-colors motion-reduce:transition-none">{">"}</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="text-foreground">Search for</span>{" "}
            <span className="text-muted-foreground">latest tech news</span>
          </span>
        </button>
      </ThreadPrimitive.Suggestion>
    </div>
  );
}

function Composer({ activeInterrupt, onResolveInterrupt, selectedModel = 'meta-muse-spark', onSelectModel }) {
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [turboMenuOpen, setTurboMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  if (activeInterrupt) {
    return (
      <div className="w-full">
        <AskUserInterruptCard
          interrupt={activeInterrupt}
          onResolve={onResolveInterrupt}
        />
      </div>
    );
  }

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone asChild>
        <section className="aic-composer-card">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              // File input handler
            }}
          />
          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder="What would you like to do today?"
            className="aic-prompt-input"
            rows={1}
            autoFocus
            enterKeyHint="send"
            aria-label="Prompt input"
          />

          <div className="flex items-center justify-between gap-2 relative w-full min-w-0">
            {/* Left Controls: Plus Button + Model Trigger */}
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {/* Plus Popover */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPlusMenuOpen((prev) => !prev)}
                  className="aic-icon-btn"
                  title="Add files and extensions (Ctrl+U)"
                >
                  <Plus size={16} />
                </button>

                <div
                  className={`aic-glass-popover ${
                    plusMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden'
                  } absolute left-0 bottom-[40px] w-[210px] rounded-[18px] p-1.5 z-40`}
                >
                  <div
                    onClick={() => {
                      fileInputRef.current?.click();
                      setPlusMenuOpen(false);
                    }}
                    className="aic-mode-menu-item flex items-center justify-between !h-9 px-3 cursor-pointer hover:bg-white/[0.08]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Paperclip size={15} className="text-zinc-300 shrink-0" />
                      <span className="text-[13px] font-medium text-zinc-100">Upload or add files</span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">Ctrl+U</span>
                  </div>

                  <div className="my-1 border-t border-white/[0.08]" />

                  <div
                    className="aic-mode-menu-item flex items-center justify-between !h-9 px-3 opacity-40 cursor-not-allowed select-none pointer-events-none"
                    title="Skills (coming soon)"
                  >
                    <div className="flex items-center gap-2.5">
                      <ScrollText size={15} className="text-zinc-400 shrink-0" />
                      <span className="text-[13px] font-medium text-zinc-300">Skills</span>
                    </div>
                    <ChevronRight size={14} className="text-zinc-500" />
                  </div>

                  <div
                    className="aic-mode-menu-item flex items-center justify-between !h-9 px-3 opacity-40 cursor-not-allowed select-none pointer-events-none"
                    title="Connectors (coming soon)"
                  >
                    <div className="flex items-center gap-2.5">
                      <LayoutGrid size={15} className="text-zinc-400 shrink-0" />
                      <span className="text-[13px] font-medium text-zinc-300">Connectors</span>
                    </div>
                    <ChevronRight size={14} className="text-zinc-500" />
                  </div>

                  <div
                    className="aic-mode-menu-item flex items-center justify-between !h-9 px-3 opacity-40 cursor-not-allowed select-none pointer-events-none"
                    title="Plugins (coming soon)"
                  >
                    <div className="flex items-center gap-2.5">
                      <Puzzle size={15} className="text-zinc-400 shrink-0" />
                      <span className="text-[13px] font-medium text-zinc-300">Plugins</span>
                    </div>
                    <ChevronRight size={14} className="text-zinc-500" />
                  </div>
                </div>
              </div>

              {/* Model Trigger */}
              <div className="relative inline-flex items-center min-w-0 flex-shrink">
                <button
                  type="button"
                  onClick={() => setModelMenuOpen((prev) => !prev)}
                  className="aic-model-trigger-btn"
                >
                  <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 border border-white/10">
                    <Sparkles size={11} className="text-zinc-200" />
                  </span>
                  <span className="font-medium truncate text-[13.5px] text-zinc-100">
                    {selectedModel}
                  </span>
                  <ChevronDown size={14} className="text-zinc-400 shrink-0" />
                </button>

                <div
                  className={`aic-glass-popover ${
                    modelMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden'
                  } absolute left-0 bottom-[40px] w-[250px] rounded-[18px] p-2 z-40`}
                >
                  <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Active Model
                  </div>
                  {/* Meta Muse Spark */}
                  <div
                    onClick={() => {
                      onSelectModel?.('meta-muse-spark');
                      setModelMenuOpen(false);
                    }}
                    className={`aic-mode-menu-item !h-9 px-2.5 rounded-lg flex items-center justify-between cursor-pointer ${
                      selectedModel === 'meta-muse-spark' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-sky-400" />
                      <span className="text-[13px]">meta-muse-spark</span>
                    </div>
                    <span className="text-[10px] text-sky-400 font-mono">default</span>
                  </div>

                  {/* Gemini 3.8 Flash */}
                  <div
                    onClick={() => {
                      onSelectModel?.('gemini-3.8-flash');
                      setModelMenuOpen(false);
                    }}
                    className={`aic-mode-menu-item !h-9 px-2.5 rounded-lg flex items-center justify-between cursor-pointer ${
                      selectedModel === 'gemini-3.8-flash' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-amber-400" />
                      <span className="text-[13px]">gemini-3.8-flash</span>
                    </div>
                    <span className="text-[10px] text-amber-400 font-mono">fast</span>
                  </div>

                  {/* Gemini 3.1 Pro Preview */}
                  <div
                    onClick={() => {
                      onSelectModel?.('gemini-3.1-pro-preview');
                      setModelMenuOpen(false);
                    }}
                    className={`aic-mode-menu-item !h-9 px-2.5 rounded-lg flex items-center justify-between cursor-pointer ${
                      selectedModel === 'gemini-3.1-pro-preview' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-indigo-400" />
                      <span className="text-[13px]">gemini-3.1-pro</span>
                    </div>
                    <span className="text-[10px] text-indigo-400 font-mono">deep</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Controls: Turbo Mode + Submit / Stop */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setTurboMenuOpen((prev) => !prev)}
                  className="aic-decluttered-turbo-btn"
                  title="Execution autonomy mode"
                >
                  <Zap size={13} className="text-amber-400" />
                  <span>Turbo</span>
                </button>

                <div
                  className={`aic-glass-popover ${
                    turboMenuOpen ? 'aic-popover-visible' : 'aic-popover-hidden'
                  } absolute right-0 bottom-[40px] w-[210px] rounded-[18px] p-2.5 z-40`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100 mb-1">
                    <Zap size={13} className="text-amber-400" />
                    <span>Turbo Autonomy</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Autonomous self-healing browser stream & agentic execution active.
                  </p>
                </div>
              </div>

              {/* Submit / Stop Circular Button */}
              <AuiIf condition={(s) => !s.thread.isRunning}>
                <ComposerPrimitive.Send asChild>
                  <button
                    type="submit"
                    className="aic-submit-circle-btn ready"
                    title="Send prompt"
                    aria-label="Send prompt"
                  >
                    <ArrowUp size={15} strokeWidth={2.3} />
                  </button>
                </ComposerPrimitive.Send>
              </AuiIf>

              <AuiIf condition={(s) => s.thread.isRunning}>
                <ComposerPrimitive.Cancel asChild>
                  <button
                    type="button"
                    className="aic-submit-circle-btn ready"
                    title="Stop generation"
                    aria-label="Stop generation"
                  >
                    <Square size={11} fill="currentColor" />
                  </button>
                </ComposerPrimitive.Cancel>
              </AuiIf>
            </div>
          </div>
        </section>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
}

function ThreadScrollToBottom() {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
}

function UserMessage() {
  const attachments = useAuiState(
    (s) => s.message.metadata?.custom?.attachments || s.message.attachments || []
  );

  return (
    <MessagePrimitive.Root
      className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col items-end gap-1.5 px-2 py-2 fade-in slide-in-from-bottom-1 animate-in duration-150 group/user-msg"
      data-role="user"
    >
      <UserMessageAttachments attachments={attachments} />

      <div className="relative flex max-w-[85%] flex-col items-end">
        <div className="rounded-2xl bg-background dark:bg-[#18181c] px-4 py-2.5 text-sm text-foreground break-words leading-relaxed">
          <MessagePrimitive.Parts />
        </div>
        <div className="absolute top-1/2 -left-8 -translate-y-1/2 opacity-0 group-hover/user-msg:opacity-100 transition-opacity">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="-mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
}

function UserActionBar() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="p-4">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
}

function EditComposer() {
  return (
    <MessagePrimitive.Root className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col px-2">
      <ComposerPrimitive.Root className="border-foreground/10 focus-within:border-foreground/25 ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-[var(--composer-radius)] border bg-[var(--composer-bg)] transition-[border-color]">
        <ComposerPrimitive.Input
          className="min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base text-foreground outline-none"
          autoFocus
        />
        <div className="mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" className="h-8 px-3">Cancel</Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 px-3">Update</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function formatRunDuration(ms) {
  if (!ms || ms <= 0) return undefined;
  const sec = ms / 1000;
  if (sec < 60) {
    return `${sec.toFixed(1)}s`;
  }
  const mins = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${mins}m ${remSec}s`;
}

function extractThinkingStepLabel(text) {
  if (typeof text !== "string" || !text.trim()) return "Thinking";
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const boldMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (boldMatch) return `Thinking · ${boldMatch[1].slice(0, 48)}`;
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) return `Thinking · ${headingMatch[1].slice(0, 48)}`;
  }
  return "Thinking";
}

const PROMOTED_VISUAL_TOOLS = new Set([
  "generate_image",
  "image_generation",
  "create_image",
  "edit_image",
  "agent_plan",
  "create_plan",
  "update_plan",
  "task_card",
  "create_task_card",
  "agent_status",
  "status_badge",
  "option_list",
  "select_options",
  "recommendation_card",
  "recommend_decision",
  "artifact_card",
  "create_artifact_card",
  "todo_list",
  "create_todo_list",
  "todos",
  "agent_handoff",
  "handoff_agent",
  "background_inbox",
  "background_runs",
  "checkpoint_history",
  "checkpoints",
]);

function generateToolGroupTitle(tools) {
  if (!tools || tools.length === 0) return "Tool execution";
  const names = tools.map((t) => String(t.toolName || t.name || "").toLowerCase());
  const count = tools.length;

  const isAll = (prefix) => names.every((n) => n.startsWith(prefix) || n.includes(prefix));
  const hasAny = (prefix) => names.some((n) => n.startsWith(prefix) || n.includes(prefix));

  if (isAll("browser_read_page") || isAll("read_page")) {
    return count === 1 ? "Read 1 web page" : `Read ${count} web pages`;
  }
  if (isAll("browser_navigate") || isAll("navigate")) {
    return count === 1 ? "Navigated to web page" : `Navigated to ${count} web pages`;
  }
  if (isAll("browser")) {
    return `Browsed the web (${count} steps)`;
  }
  if (isAll("search")) {
    return count === 1 ? "Searched the web" : `Searched the web (${count} queries)`;
  }
  if (isAll("view_file") || isAll("read_file")) {
    return count === 1 ? "Read 1 file" : `Read ${count} files`;
  }
  if (isAll("replace_file") || isAll("write_to_file") || isAll("edit")) {
    return count === 1 ? "Edited 1 file" : `Edited ${count} files`;
  }
  if (isAll("bash") || isAll("command") || isAll("exec")) {
    return count === 1 ? "Ran terminal command" : `Ran ${count} terminal commands`;
  }
  if (isAll("fetch") || isAll("read_url")) {
    return count === 1 ? "Fetched 1 URL" : `Fetched ${count} URLs`;
  }

  // Mixed tool combinations
  if (hasAny("browser") && hasAny("search")) {
    return `Web search & browsing (${count} steps)`;
  }
  if (hasAny("file") && (hasAny("bash") || hasAny("command"))) {
    return `File & terminal operations (${count} steps)`;
  }
  if (hasAny("view_file") && hasAny("edit")) {
    return `Inspected & modified code (${count} steps)`;
  }

  const distinctNames = Array.from(
    new Set(names.map((n) => n.replace(/^(browser_|tools?_)/, "").replace(/_/g, " ")))
  );
  if (distinctNames.length === 1) {
    const formatted = distinctNames[0].charAt(0).toUpperCase() + distinctNames[0].slice(1);
    return `${formatted} (${count} steps)`;
  }
  return `Executed ${count} tools`;
}

const safeHost = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return String(value).slice(0, 40);
  }
};

const baseName = (value) => String(value || "").split(/[/\\]/).pop() || "";

// Maps a tool-call part onto the gathered ToolTimeline step shape ({ verb, chip, icon })
function toTimelineStep(part, idx) {
  const name = String(part?.toolName || part?.name || "tool");
  const lower = name.toLowerCase();
  const args = part?.args || part?.arguments || {};
  const id = part?.toolCallId || part?.id || `step-${idx}`;

  if (lower.includes("read_page") || lower === "read_url_content") {
    return { id, verb: "Read page", chip: args.url ? safeHost(args.url) : "webpage", icon: GlobeIcon };
  }
  if (lower.includes("search")) {
    return { id, verb: "Searched", chip: String(args.query || args.Query || "the web").slice(0, 36), icon: SearchIcon };
  }
  if (lower.startsWith("browser")) {
    return { id, verb: "Browser", chip: String(args.action || args.url || "action").slice(0, 36), icon: MousePointerClickIcon };
  }
  if (/(read|view)_?file|file_read/.test(lower)) {
    return { id, verb: "Read", chip: baseName(args.path || args.AbsolutePath || args.file || args.filename) || "file", icon: FileIcon };
  }
  if (/(write|edit|replace)/.test(lower) && lower.includes("file")) {
    return { id, verb: "Edited", chip: baseName(args.path || args.TargetFile || args.file || args.filename) || "file", icon: FileIcon };
  }
  if (lower === "shell_run" || lower === "run_command" || lower === "bash") {
    return { id, verb: "Ran", chip: String(args.command || args.CommandLine || args.cmd || "command").slice(0, 36), icon: TerminalIcon };
  }
  const readable = lower.replace(/_/g, " ");
  return {
    id,
    verb: readable.charAt(0).toUpperCase() + readable.slice(1),
    chip: "done",
    icon: WrenchIcon,
  };
}

// Logic-only wrapper: drives the gathered ToolTimeline (auto-open while running, auto-collapse when done)
function ToolTimelineGroup({ tools = [], isLatestBatch = false, isRunning = false }) {
  const isAnyRunning = tools.some(
    (t) => t.status?.type === "running" || t.status === "running"
  );
  const isGroupActive = Boolean(isRunning && (isAnyRunning || isLatestBatch));

  const [userOpen, setUserOpen] = React.useState(null);
  const prevActiveRef = React.useRef(isGroupActive);

  React.useEffect(() => {
    if (prevActiveRef.current && !isGroupActive) {
      setUserOpen(false);
    } else if (!prevActiveRef.current && isGroupActive) {
      setUserOpen(null);
    }
    prevActiveRef.current = isGroupActive;
  }, [isGroupActive]);

  const open = userOpen !== null ? userOpen : isGroupActive;
  const steps = tools.map((tool, idx) => toTimelineStep(tool, idx));
  const latestTool = tools[tools.length - 1];

  return (
    <ToolTimeline
      steps={steps}
      visibleSteps={steps.length}
      streaming={isGroupActive}
      open={open}
      onOpenChange={(next) => setUserOpen(next)}
      restingLabel={generateToolGroupTitle(tools)}
      activeLabel={getToolActivityLabel(latestTool) || generateToolGroupTitle(tools)}
      stats={[]}
    />
  );
}

function AssistantMessageBody() {
  const [userOpen, setUserOpen] = useState(null);
  const [manualEntryId, setManualEntryId] = useState(null);
  const custom = useAuiState((s) => s.message.metadata?.custom);
  const content = useAuiState((s) => s.message.content);
  const isLast = useAuiState((s) => s.message.isLast);
  const threadIsRunning = useAuiState((s) => s.thread.isRunning);

  const isRunning = Boolean(isLast && threadIsRunning);
  const runStartedAt = custom?.runStartedAt;
  const runCompletedAt = custom?.runCompletedAt;

  const rawParts = Array.isArray(custom?.rawParts)
    ? custom.rawParts
    : (content || []).filter((p) => !(p.type === "text" && !p.text));

  // Helper to identify submitted QA parts across standard and normalized formats
  const isSubmittedQAPart = (p) =>
    Boolean(
      p &&
      (p.type === "submitted-ask-user" ||
        p.type === "ask-user-response" ||
        p.type === "data-submitted-ask-user" ||
        p.name === "submitted-ask-user" ||
        (p.type === "data" && (p.name === "submitted-ask-user" || p.data?.questions)))
    );

  // Find last non-text activity part (tool-call, reasoning, plan, data)
  let lastActivityIdx = -1;
  let activityCount = 0;
  let hasFinalAnswerText = false;
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i];
    if (p && p.type !== "text" && p.type !== "source" && !isSubmittedQAPart(p)) {
      lastActivityIdx = i;
      activityCount++;
    }
  }
  for (let i = Math.max(0, lastActivityIdx + 1); i < rawParts.length; i++) {
    if (rawParts[i]?.type === "text" && String(rawParts[i]?.text || "").trim()) {
      hasFinalAnswerText = true;
      break;
    }
  }

  // Group is actively running intermediate steps only while isRunning and before final response text starts
  const isGroupActive = Boolean(isRunning && !hasFinalAnswerText);

  const prevActivityCountRef = React.useRef(activityCount);
  const prevGroupActiveRef = React.useRef(isGroupActive);

  React.useEffect(() => {
    // When a new collapsible is added to the group, auto-collapse any manually opened previous collapsible
    if (activityCount > prevActivityCountRef.current) {
      setManualEntryId(null);
    }
    prevActivityCountRef.current = activityCount;
  }, [activityCount]);

  React.useEffect(() => {
    // When the group reaches its final output or finishes, auto-collapse both inner collapsibles and outer group
    if (prevGroupActiveRef.current && !isGroupActive) {
      setManualEntryId(null);
      setUserOpen(false);
    } else if (!prevGroupActiveRef.current && isGroupActive) {
      setUserOpen(null);
    }
    prevGroupActiveRef.current = isGroupActive;
  }, [isGroupActive]);

  if (rawParts.length === 0) {
    if (isRunning) {
      return (
        <div className="py-2">
          <ThinkingIndicator label="Thinking" startTime={runStartedAt} />
        </div>
      );
    }
    return null;
  }

  // Batch contiguous non-promoted tool-calls into parent groups when length >= 2
  const batchedParts = [];
  let currentToolBatch = [];

  const flushToolBatch = () => {
    if (currentToolBatch.length === 0) return;
    if (currentToolBatch.length === 1) {
      batchedParts.push(currentToolBatch[0]);
    } else {
      batchedParts.push({
        type: "tool-group",
        id: `tool-group-${currentToolBatch[0].part.toolCallId || currentToolBatch[0].idx}`,
        tools: currentToolBatch.map((item) => item.part),
        indices: currentToolBatch.map((item) => item.idx),
      });
    }
    currentToolBatch = [];
  };

  rawParts.forEach((part, idx) => {
    if (!part) return;
    const lowerTool = String(part.toolName || part.name || "").toLowerCase();
    const isPromoted = part.type === "tool-call" && PROMOTED_VISUAL_TOOLS.has(lowerTool);

    if (part.type === "tool-call" && !isPromoted) {
      currentToolBatch.push({ part, idx });
    } else {
      flushToolBatch();
      batchedParts.push({ part, idx });
    }
  });
  flushToolBatch();

  const entries = [];
  const promotedVisualNodes = [];
  const finalAnswerParts = [];
  const sourceParts = [];

  batchedParts.forEach((item) => {
    if (item.type === "tool-group") {
      const tools = item.tools;
      const indices = item.indices;
      const isLatestBatch = isGroupActive && indices.includes(lastActivityIdx);
      const groupLabel = generateToolGroupTitle(tools);

      entries.push({
        id: item.id,
        kind: "tool",
        label: groupLabel,
        content: (
          <ToolTimelineGroup
            key={item.id}
            tools={tools}
            isLatestBatch={isLatestBatch}
            isRunning={isRunning}
          />
        ),
      });
      return;
    }

    const { part, idx } = item;
    const isLatestStep = isGroupActive && idx === lastActivityIdx;

    if (part.type === "tool-call") {
      const entryId = part.toolCallId || `tool-${idx}`;
      const lowerTool = String(part.toolName || part.name || "").toLowerCase();
      const isOpen =
        manualEntryId !== null
          ? manualEntryId === entryId
          : false;

      if (PROMOTED_VISUAL_TOOLS.has(lowerTool)) {
        promotedVisualNodes.push(
          <div key={`promoted-${entryId}`} className="my-2">
            {renderToolCallPart(part)}
          </div>
        );
      } else {
        entries.push({
          id: entryId,
          kind: "tool",
          label: getToolActivityLabel(part),
          content: renderToolCallPart(part, {
            active: isLatestStep,
            open: isOpen,
            onOpenChange: (next) => setManualEntryId(next ? entryId : null),
          }),
        });
      }
    } else if (part.type === "reasoning") {
      const entryId = part.id || `reasoning-${idx}`;
      const stepLabel = extractThinkingStepLabel(part.text);
      const isStreamingReasoning = Boolean(
        isLatestStep && (part.status?.type === "running" || idx === rawParts.length - 1)
      );
      const isOpen =
        manualEntryId !== null
          ? manualEntryId === entryId
          : isStreamingReasoning;

      entries.push({
        id: entryId,
        kind: "commentary",
        label: stepLabel,
        content: (
          <Reasoning
            text={part.text}
            status={part.status}
            label={stepLabel}
            streaming={isStreamingReasoning}
            open={isOpen}
            onOpenChange={(next) => setManualEntryId(next ? entryId : null)}
          />
        ),
      });
    } else if (isSubmittedQAPart(part)) {
      const qData =
        part.questions ||
        part.questionsAndAnswers ||
        part.data?.questions ||
        part.data?.questionsAndAnswers ||
        [];
      promotedVisualNodes.push(
        <div key={part.id || `submitted-qa-${idx}`} className="my-2">
          <SubmittedAskUserCard questions={qData} />
        </div>
      );
    } else if (part.type === "plan" || part.type === "data") {
      entries.push({
        id: part.id || `data-${idx}`,
        kind: "tool",
        label: part.title || part.name || "Planning",
        content: renderDataPart(
          part.type === "plan" ? { name: "plan", ...part } : part
        ),
      });
    } else if (part.type === "source") {
      sourceParts.push(part);
    } else if (part.type === "text") {
      const trimmed = (part.text || "").trim();
      if (!trimmed) return;

      if (idx < lastActivityIdx) {
        const firstLine = trimmed.split("\n")[0].replace(/^[#>*-\s]+/, "").slice(0, 72);
        entries.push({
          id: part.id || `commentary-${idx}`,
          kind: "commentary",
          label: firstLine || "Thinking",
          content: (
            <div className="text-foreground/90 leading-relaxed">
              <MarkdownText text={part.text} />
            </div>
          ),
        });
      } else {
        finalAnswerParts.push(part);
      }
    }
  });

  const durationMs =
    runStartedAt && runCompletedAt && runCompletedAt >= runStartedAt
      ? runCompletedAt - runStartedAt
      : undefined;
  const durationLabel = !isRunning ? formatRunDuration(durationMs) : undefined;

  const status = isRunning
    ? "running"
    : custom?.runStatus === "requires-action"
      ? "requires-action"
      : custom?.runStatus === "cancelled"
        ? "cancelled"
        : custom?.runStatus === "error"
          ? "error"
          : "complete";

  // Derive live dynamic status label based on what the agent is currently doing
  let activeRunningLabel = "Thinking";
  if (isRunning && rawParts.length > 0) {
    const lastPart = rawParts[rawParts.length - 1];
    if (lastPart?.type === "tool-call") {
      activeRunningLabel = getToolActivityLabel(lastPart) || "Running tool";
    } else if (lastPart?.type === "reasoning") {
      activeRunningLabel = extractThinkingStepLabel(lastPart.text);
    } else if (lastPart?.type === "plan" || lastPart?.type === "data") {
      activeRunningLabel = lastPart.title || lastPart.name || "Planning";
    } else if (lastPart?.type === "text" && finalAnswerParts.length > 0) {
      activeRunningLabel = "Writing response";
    } else if (entries.length > 0) {
      activeRunningLabel = entries[entries.length - 1].label || "Thinking";
    }
  }

  const statusLabel =
    status === "running"
      ? activeRunningLabel
      : status === "requires-action"
        ? "Needs your input"
        : status === "cancelled"
          ? durationLabel != null
            ? "Stopped after"
            : "Stopped"
          : status === "error"
            ? durationLabel != null
              ? "Failed after"
              : "Failed"
            : durationLabel != null
              ? "Worked for"
              : "Completed";

  const finalAnswerNode =
    promotedVisualNodes.length > 0 || finalAnswerParts.length > 0 ? (
      <div className="flex flex-col gap-3 text-foreground leading-relaxed">
        {promotedVisualNodes}
        {finalAnswerParts.map((part, idx) => {
          const cleanText =
            promotedVisualNodes.length > 0
              ? String(part.text || "").replace(/!\[[^\]]*\]\(\/api\/images\/[^)]+\)/g, "").trim()
              : part.text;
          if (!cleanText) return null;
          return <MarkdownText key={part.id || `ans-${idx}`} text={cleanText} />;
        })}
        {sourceParts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sourceParts.map((sp, i) => (
              <Sources key={sp.id || i} {...sp} />
            ))}
          </div>
        )}
      </div>
    ) : null;

  const groupOpen = userOpen !== null ? userOpen : isGroupActive;

  if (entries.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <RunActivity
          status={status}
          statusLabel={statusLabel}
          durationLabel={durationLabel}
          entries={entries}
          open={groupOpen}
          onOpenChange={(next) => {
            setUserOpen(next);
            if (!next) setManualEntryId(null);
          }}
        />
        {promotedVisualNodes.length > 0 && (
          <div className="flex flex-col gap-2">
            {promotedVisualNodes}
          </div>
        )}
        {finalAnswerParts.length > 0 && (
          <div className="flex flex-col gap-3 text-foreground leading-relaxed">
            {finalAnswerParts.map((part, idx) => {
              const cleanText =
                promotedVisualNodes.length > 0
                  ? String(part.text || "").replace(/!\[[^\]]*\]\(\/api\/images\/[^)]+\)/g, "").trim()
                  : part.text;
              if (!cleanText) return null;
              return <MarkdownText key={part.id || `ans-${idx}`} text={cleanText} />;
            })}
            {sourceParts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sourceParts.map((sp, i) => (
                  <Sources key={sp.id || i} {...sp} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (promotedVisualNodes.length > 0 || finalAnswerParts.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        {promotedVisualNodes.length > 0 && (
          <div className="flex flex-col gap-2">
            {promotedVisualNodes}
          </div>
        )}
        {finalAnswerParts.length > 0 && (
          <div className="flex flex-col gap-3 text-foreground leading-relaxed">
            {finalAnswerParts.map((part, idx) => {
              const cleanText =
                promotedVisualNodes.length > 0
                  ? String(part.text || "").replace(/!\[[^\]]*\]\(\/api\/images\/[^)]+\)/g, "").trim()
                  : part.text;
              if (!cleanText) return null;
              return <MarkdownText key={part.id || `ans-${idx}`} text={cleanText} />;
            })}
            {sourceParts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sourceParts.map((sp, i) => (
                  <Sources key={sp.id || i} {...sp} />
                ))}
              </div>
            )}
          </div>
        )}
        {isRunning && (
          <div className="py-2">
            <ThinkingIndicator label={activeRunningLabel} startTime={runStartedAt} />
          </div>
        )}
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="py-2">
        <ThinkingIndicator label={activeRunningLabel} startTime={runStartedAt} />
      </div>
    );
  }

  return null;
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root
      className="relative mx-auto w-full max-w-[var(--thread-max-width)] px-2 fade-in slide-in-from-bottom-1 animate-in duration-150"
      data-role="assistant"
    >
      <div className="break-words leading-relaxed text-foreground">
        <AssistantMessageBody />
        <MessageError />
      </div>

      <div className="mt-1 ml-2 flex min-h-6 items-center">
        <BranchPicker />
        <AssistantActionBar />
      </div>

      <AuiIf condition={(s) => !s.thread.isRunning}>
        <div className="mt-4 flex flex-wrap gap-2">
          <ThreadPrimitive.Suggestion
            prompt="Tell me more"
            className="border-foreground/10 hover:border-foreground/25 hover:bg-foreground/[0.03] rounded-md border px-2.5 py-1 text-sm whitespace-nowrap transition-colors ease-in motion-reduce:transition-none"
          >
            Tell me more
          </ThreadPrimitive.Suggestion>
          <ThreadPrimitive.Suggestion
            prompt="Can you explain differently?"
            className="border-foreground/10 hover:border-foreground/25 hover:bg-foreground/[0.03] rounded-md border px-2.5 py-1 text-sm whitespace-nowrap transition-colors ease-in motion-reduce:transition-none"
          >
            Explain differently
          </ThreadPrimitive.Suggestion>
        </div>
      </AuiIf>
    </MessagePrimitive.Root>
  );
}

function MessageError() {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}

function AssistantActionBar() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="-ml-1 flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.ExportMarkdown asChild>
        <TooltipIconButton tooltip="Export as Markdown">
          <DownloadIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.ExportMarkdown>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>

      <ActionBarPrimitive.FeedbackPositive asChild>
        <TooltipIconButton tooltip="Good response">
          <ThumbsUpIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative asChild>
        <TooltipIconButton tooltip="Bad response">
          <ThumbsDownIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.FeedbackNegative>
    </ActionBarPrimitive.Root>
  );
}

function BranchPicker({ className, ...rest }) {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn("mr-2 -ml-2 inline-flex items-center text-xs text-muted-foreground", className)}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}
