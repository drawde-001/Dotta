import React, { useState, useRef } from "react";
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
  Zap
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
import { Plan } from "@/components/assistant-ui/elements/plan.aui";
import {
  ThinkingIndicator,
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
} from "@/components/assistant-ui/elements";
import { AskUserInterruptCard } from "@/components/AskUserInterruptCard";
import { cn } from "@/lib/utils";

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
  return (
    <MessagePrimitive.Root
      className="mx-auto grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 fade-in slide-in-from-bottom-1 animate-in duration-150"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="relative col-start-2 min-w-0">
        <div className="rounded-[var(--composer-radius)] bg-muted px-4 py-2 break-words text-foreground">
          <MessagePrimitive.Parts />
        </div>
        <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="col-span-full col-start-1 -mr-1 justify-end" />
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

function AssistantMessage() {
  return (
    <MessagePrimitive.Root
      className="relative mx-auto w-full max-w-[var(--thread-max-width)] px-2 fade-in slide-in-from-bottom-1 animate-in duration-150"
      data-role="assistant"
    >
      <div className="break-words leading-relaxed text-foreground">
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-reasoning"],
            source: ["group-source"],
          })}
        >
          {({ part, children }) => {
            try {
              switch (part.type) {
                case "group-reasoning": {
                  const running = part.status?.type === "running";
                  return (
                    <ReasoningRoot variant="muted" className="mb-0" streaming={running}>
                      <ReasoningTrigger active={running} />
                      <ReasoningContent aria-busy={running}>
                        <ReasoningText>{children}</ReasoningText>
                      </ReasoningContent>
                    </ReasoningRoot>
                  );
                }
                case "reasoning":
                  return <Reasoning {...part} />;
                case "group-source":
                  return <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>;
                case "source":
                  return <Sources {...part} />;
                case "text":
                  return <MarkdownText />;
                case "image":
                  return <MessagePartPrimitive.Image />;
                case "tool-call": {
                  if (part.toolUI) return part.toolUI;
                  const toolName = part.toolName || part.name || 'tool';
                  const args = part.args || part.arguments;
                  if (['bash', 'terminal', 'run_command', 'execute_command'].includes(toolName)) {
                    const cmd = (args && typeof args === 'object' ? args.command || args.CommandLine : args) || toolName;
                    const outputStr = part.result ? (typeof part.result === 'string' ? part.result : JSON.stringify(part.result)) : '';
                    const outputLines = outputStr ? outputStr.split('\n').filter(Boolean) : [];
                    return (
                      <div className="my-2">
                        <TerminalBlock
                          command={typeof cmd === 'string' ? cmd : JSON.stringify(cmd)}
                          state={part.status?.type === 'running' ? 'running' : part.status?.type === 'error' ? 'failed' : 'done'}
                          output={outputLines.slice(0, 8)}
                        />
                      </div>
                    );
                  }
                  if (['edit_file', 'replace_file_content', 'code_diff'].includes(toolName)) {
                    const filename = (args && typeof args === 'object' ? args.TargetFile || args.path || args.filename : 'code');
                    return (
                      <div className="my-2">
                        <CodeDiff filename={typeof filename === 'string' ? filename.split(/[/\\]/).pop() : 'edit'} />
                      </div>
                    );
                  }
                  return (
                    <div className="my-1.5">
                      <ToolCall
                        toolName={toolName}
                        completedName={toolName}
                        argument={args ? (typeof args === 'string' ? args : JSON.stringify(args).slice(0, 45)) : ''}
                        result={part.result}
                        isComplete={part.status?.type !== 'running'}
                      />
                    </div>
                  );
                }
                case "plan": {
                  const pData = part.data || part;
                  return (
                    <div className="my-2">
                      <AgentPlan title={pData.title || "Plan"} steps={pData.steps || []} />
                    </div>
                  );
                }
                case "data": {
                  const dName = part.name;
                  const d = part.data || part;
                  if (dName === 'plan' || d?.steps) {
                    return <div className="my-2"><AgentPlan title={d.title || "Plan"} steps={d.steps || []} /></div>;
                  }
                  if (dName === 'code_diff') {
                    return <div className="my-2"><CodeDiff {...d} /></div>;
                  }
                  if (dName === 'file_tree') {
                    return <div className="my-2"><FileTree {...d} /></div>;
                  }
                  if (dName === 'terminal') {
                    return <div className="my-2"><TerminalBlock {...d} /></div>;
                  }
                  if (dName === 'guardrail') {
                    return <div className="my-2"><GuardrailNotice {...d} /></div>;
                  }
                  if (dName === 'confidence') {
                    return <div className="my-2"><ConfidenceMarker {...d} /></div>;
                  }
                  if (dName === 'reasoning_effort') {
                    return <div className="my-2"><ReasoningEffort {...d} /></div>;
                  }
                  return part.dataRendererUI;
                }
                case "indicator":
                  return <span style={{ fontFamily: "revert" }}>{" \u25CF"}</span>;
                default:
                  return null;
              }
            } catch (err) {
              console.error("Error rendering message part:", part, err);
              return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
        <AuiIf condition={(s) => s.thread.isRunning && s.message.content.length === 0}>
          <div className="py-2.5">
            <ThinkingIndicator label="Thinking" />
          </div>
        </AuiIf>
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
