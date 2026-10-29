"use client";

import React, { useState } from "react";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";
import {
  collapsePanel,
  field,
  mono,
  ShimmerLabel,
  SwapLabel,
} from "./surfaces";

export function ToolCall({
  label: propLabel,
  activeLabel: propActiveLabel,
  toolName,
  completedName,
  query: propQuery,
  argument,
  request: propRequest,
  argsText,
  result: propResult,
  running: propRunning,
  isComplete,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  className,
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const onOpenChange = (next) => {
    if (!isControlled) setUncontrolledOpen(next);
    controlledOnOpenChange?.(next);
  };

  const running =
    propRunning !== undefined
      ? Boolean(propRunning)
      : isComplete !== undefined
        ? !isComplete
        : false;

  const label = propLabel || completedName || toolName || "Tool";
  const activeLabel = propActiveLabel || toolName || label;
  const query = propQuery ?? argument ?? "";
  const request =
    propRequest ??
    argsText ??
    (typeof argument === "string" && argument ? argument : "{}");
  const result =
    typeof propResult === "string"
      ? propResult
      : propResult !== undefined && propResult !== null
        ? JSON.stringify(propResult, null, 2)
        : running
          ? "Running..."
          : "Done";

  return (
    <Collapsible
      data-slot="tool-call"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("w-full max-w-sm", className)}
    >
      <CollapsibleTrigger className="group/trigger text-muted-foreground hover:text-foreground/90 flex w-full items-center gap-2 rounded-md py-1 text-[13.5px] transition-colors outline-none cursor-pointer">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />
        <SwapLabel
          active={running ? 0 : 1}
          className="shrink-0 text-start whitespace-nowrap"
        >
          <ShimmerLabel
            active={running}
            className="relative inline-block leading-none"
          >
            {activeLabel}
          </ShimmerLabel>
          <>{label}</>
        </SwapLabel>
        {query && (
          <span
            className={cn(
              mono,
              "bg-foreground/[0.06] text-foreground/70 min-w-0 truncate rounded-md px-1.5 py-0.5"
            )}
          >
            {query}
          </span>
        )}
        <span className="ms-auto flex w-4 shrink-0 items-center justify-end">
          {!running && (
            <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-emerald-500 duration-200" />
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, "outline-none")}>
        <div className={cn(field, "mt-2 overflow-hidden rounded-2xl text-xs")}>
          <div className="px-3.5 pt-2.5 pb-2">
            <p className={cn(mono, "text-muted-foreground mb-1 m-0")}>Request</p>
            <p className="text-muted-foreground font-mono break-words m-0">
              {request}
            </p>
          </div>
          <div className="bg-foreground/[0.06] mx-3.5 h-px" />
          <div className="px-3.5 pt-2 pb-2.5">
            <p className={cn(mono, "text-muted-foreground mb-1 m-0")}>Result</p>
            <p className="text-foreground/90 break-words m-0">{result}</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default ToolCall;
