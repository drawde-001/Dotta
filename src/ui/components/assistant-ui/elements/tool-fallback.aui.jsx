"use client";

import React, { memo, useCallback, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";

const ANIMATION_DURATION = 200;

function ToolFallbackRoot({
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}) {
  const collapsibleRef = useRef(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open) => {
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [isControlled, controlledOnOpenChange]
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="tool-fallback-root"
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "aui-tool-fallback-root group/tool-fallback-root w-full",
        className
      )}
      style={{
        "--animation-duration": `${ANIMATION_DURATION}ms`,
      }}
      {...props}
    >
      {children}
    </Collapsible>
  );
}

const statusIconMap = {
  running: LoaderIcon,
  complete: CheckIcon,
  incomplete: XCircleIcon,
  error: XCircleIcon,
  "requires-action": AlertCircleIcon,
};

const formatToolDuration = (ms) => {
  if (ms < 1000) return "<1s";
  const seconds = ms / 1000;
  if (seconds < 10) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`;
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
};

function ToolFallbackDuration({ elapsedMs, className, ...props }) {
  if (elapsedMs === undefined || elapsedMs === null) return null;

  return (
    <span
      data-slot="tool-fallback-duration"
      className={cn(
        "aui-tool-fallback-duration text-muted-foreground text-xs tabular-nums",
        className
      )}
      {...props}
    >
      {formatToolDuration(elapsedMs)}
    </span>
  );
}

function ToolFallbackTrigger({
  toolName,
  status,
  responseDeliveryStatus,
  elapsedMs,
  className,
  ...props
}) {
  const rawType = typeof status === "string" ? status : status?.type;
  const statusType =
    rawType === "error"
      ? "incomplete"
      : rawType ?? "complete";
  const isRunning = statusType === "running";
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";

  const Icon = statusIconMap[statusType] || CheckIcon;
  const label =
    responseDeliveryStatus === "queued"
      ? "Reply queued, not sent yet"
      : statusType === "running"
        ? "Running tool"
        : statusType === "requires-action"
          ? "Waiting on tool"
          : statusType === "incomplete"
            ? `${isCancelled ? "Cancelled" : "Failed"} tool`
            : "Used tool";

  return (
    <CollapsibleTrigger
      data-slot="tool-fallback-trigger"
      className={cn(
        "aui-tool-fallback-trigger group/trigger text-muted-foreground hover:text-foreground flex w-fit max-w-full origin-left items-center gap-2 py-1 text-sm transition-[color,scale] active:scale-[0.98] cursor-pointer",
        className
      )}
      {...props}
    >
      <Icon
        data-slot="tool-fallback-trigger-icon"
        className={cn(
          "aui-tool-fallback-trigger-icon size-4 shrink-0",
          isCancelled && "text-muted-foreground",
          isRunning && "animate-spin [animation-duration:0.6s]"
        )}
      />
      <span
        data-slot="tool-fallback-trigger-label"
        className={cn(
          "aui-tool-fallback-trigger-label-wrapper inline-block min-w-0 text-start leading-none wrap-anywhere",
          isCancelled && "text-muted-foreground line-through",
          isRunning && "shimmer motion-reduce:animate-none"
        )}
      >
        {label}: <b className="font-semibold text-foreground/90">{toolName}</b>
      </span>
      <ToolFallbackDuration elapsedMs={elapsedMs} />
      <ChevronDownIcon
        data-slot="tool-fallback-trigger-chevron"
        className={cn(
          "aui-tool-fallback-trigger-chevron size-4 shrink-0",
          "transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          "-rotate-90",
          "group-data-open/trigger:rotate-0",
          "group-data-panel-open/trigger:rotate-0"
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolFallbackContent({ className, children, ...props }) {
  return (
    <CollapsibleContent
      data-slot="tool-fallback-content"
      className={cn(
        "aui-tool-fallback-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none",
        "data-closed:animate-collapsible-up",
        "data-open:animate-collapsible-down",
        "data-closed:fill-mode-forwards",
        "data-closed:pointer-events-none",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "flex flex-col gap-2 ps-6 pt-1 pb-2 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none"
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

function ToolFallbackArgs({ argsText, className, ...props }) {
  if (!argsText) return null;

  return (
    <div
      data-slot="tool-fallback-args"
      className={cn("aui-tool-fallback-args", className)}
      {...props}
    >
      <pre className="aui-tool-fallback-args-value bg-muted/50 text-foreground/90 rounded-md p-2.5 text-xs break-words whitespace-pre-wrap font-mono m-0">
        {argsText}
      </pre>
    </div>
  );
}

const formatUnknownValue = (value, space) => {
  if (typeof value === "string") return value;

  try {
    if (value instanceof Error) return String(value);

    const json = JSON.stringify(value, null, space);
    if (json !== undefined) return json;
  } catch {}

  try {
    return String(value);
  } catch {
    return "[Unserializable value]";
  }
};

function ToolFallbackResult({ result, className, ...props }) {
  if (result === undefined || result === null || result === "") return null;

  return (
    <div
      data-slot="tool-fallback-result"
      className={cn("aui-tool-fallback-result", className)}
      {...props}
    >
      <p className="aui-tool-fallback-result-header text-muted-foreground text-xs font-medium m-0">
        Result:
      </p>
      <pre className="aui-tool-fallback-result-content bg-muted/50 text-foreground/90 mt-1 rounded-md p-2.5 text-xs break-words whitespace-pre-wrap font-mono m-0 max-h-60 overflow-y-auto">
        {formatUnknownValue(result, 2)}
      </pre>
    </div>
  );
}

function ToolFallbackError({ status, className, ...props }) {
  if (status?.type !== "incomplete" && status?.type !== "error") return null;

  const error = status.error;
  const errorText =
    error === undefined || error === null ? null : formatUnknownValue(error);

  if (!errorText) return null;

  const isCancelled = status.reason === "cancelled";
  const headerText = isCancelled ? "Cancelled reason:" : "Error:";

  return (
    <div
      data-slot="tool-fallback-error"
      className={cn("aui-tool-fallback-error", className)}
      {...props}
    >
      <p className="aui-tool-fallback-error-header text-muted-foreground font-semibold m-0">
        {headerText}
      </p>
      <p className="aui-tool-fallback-error-reason text-muted-foreground break-words whitespace-pre-line m-0">
        {errorText}
      </p>
    </div>
  );
}

const ToolFallbackImpl = ({
  toolName: propToolName,
  name,
  argsText: propArgsText,
  args,
  arguments: rawArgs,
  result: propResult,
  output,
  status,
  responseDeliveryStatus,
  elapsedMs,
  active = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
}) => {
  const toolName = propToolName || name || "tool";
  const resolvedArgs = args ?? rawArgs;
  const argsText =
    propArgsText ??
    (resolvedArgs !== undefined && resolvedArgs !== null
      ? typeof resolvedArgs === "string"
        ? resolvedArgs
        : JSON.stringify(resolvedArgs)
      : undefined);
  const result = propResult ?? output;

  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";
  const isRequiresAction = status?.type === "requires-action";

  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    defaultOpen || isRequiresAction
  );

  const prevActiveRef = useRef(active || isRequiresAction);
  React.useEffect(() => {
    const nowActive = Boolean(active || isRequiresAction);
    if (prevActiveRef.current && !nowActive) {
      setUncontrolledOpen(false);
    }
    prevActiveRef.current = nowActive;
  }, [active, isRequiresAction]);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const handleOpenChange = useCallback(
    (next) => {
      if (!isControlled) setUncontrolledOpen(next);
      controlledOnOpenChange?.(next);
    },
    [isControlled, controlledOnOpenChange]
  );

  return (
    <ToolFallbackRoot open={open} onOpenChange={handleOpenChange}>
      <ToolFallbackTrigger
        toolName={toolName}
        status={status}
        responseDeliveryStatus={responseDeliveryStatus}
        elapsedMs={elapsedMs}
      />
      <ToolFallbackContent>
        <ToolFallbackError status={status} />
        <ToolFallbackArgs
          argsText={argsText}
          className={cn(isCancelled && "opacity-60")}
        />
        <ToolFallbackResult result={result} />
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(ToolFallbackImpl);
ToolFallback.displayName = "ToolFallback";
ToolFallback.Root = ToolFallbackRoot;
ToolFallback.Trigger = ToolFallbackTrigger;
ToolFallback.Content = ToolFallbackContent;
ToolFallback.Args = ToolFallbackArgs;
ToolFallback.Result = ToolFallbackResult;
ToolFallback.Error = ToolFallbackError;

export {
  formatUnknownValue,
  ToolFallback,
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
};

export default ToolFallback;
