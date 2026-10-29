"use client";

import React, { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";
import { collapsePanel, ShimmerLabel, mono } from "./surfaces";

export function RunActivity({
  status = "running",
  statusLabel,
  title,
  durationLabel,
  entries = [],
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  attention,
  children,
  className,
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const onOpenChange = (next) => {
    if (!isControlled) setUncontrolledOpen(next);
    controlledOnOpenChange?.(next);
  };

  const latestActivity =
    status === "running"
      ? [...entries].reverse().find((entry) => entry?.label?.trim())?.label
      : undefined;

  const resolvedStatusLabel =
    statusLabel ??
    title ??
    (status === "running"
      ? latestActivity || "Thinking"
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
              : "Completed");

  const activeHeaderLabel =
    status === "running"
      ? latestActivity || resolvedStatusLabel || "Thinking"
      : resolvedStatusLabel;

  const summary =
    status === "running" ? (
      <span className="inline-flex min-w-0 items-center gap-2 text-start tabular-nums">
        <span
          aria-hidden
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none dark:bg-blue-400"
        />
        <ShimmerLabel
          key={activeHeaderLabel}
          active
          className="fade-in slide-in-from-bottom-1 animate-in relative inline-block min-w-0 truncate leading-tight duration-300"
        >
          {activeHeaderLabel}
        </ShimmerLabel>
        {durationLabel != null && (
          <span className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}>
            {durationLabel}
          </span>
        )}
      </span>
    ) : (
      <span className="text-start tabular-nums">
        {resolvedStatusLabel}
        {durationLabel != null && <> {durationLabel}</>}
      </span>
    );

  return (
    <div
      data-slot="run-activity"
      data-status={status}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      {entries.length > 0 ? (
        <Collapsible open={open} onOpenChange={onOpenChange}>
          <CollapsibleTrigger
            aria-busy={status === "running"}
            className="group/trigger text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex max-w-full items-center gap-1.5 rounded-md py-1 text-sm outline-none focus-visible:ring-[3px] cursor-pointer"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 transition-transform duration-200 group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none"
            />
            {summary}
          </CollapsibleTrigger>
          <CollapsibleContent className={cn(collapsePanel, "peer")}>
            <ol className="border-border ms-1.5 flex min-w-0 flex-col gap-3 border-s ps-3.5 pt-2 text-sm wrap-anywhere list-none m-0">
              {entries.map((entry) => (
                <li key={entry.id} data-activity-kind={entry.kind}>
                  {entry.content}
                </li>
              ))}
            </ol>
          </CollapsibleContent>
          {!open && latestActivity && (
            <p className="text-muted-foreground ps-5 text-sm wrap-anywhere peer-[:not([hidden])]:hidden">
              {latestActivity}
            </p>
          )}
        </Collapsible>
      ) : (
        <div className="text-muted-foreground py-1 text-sm">{summary}</div>
      )}
      <span role="status" aria-atomic="true" className="sr-only">
        {activeHeaderLabel}
        {status !== "running" && durationLabel != null && <> {durationLabel}</>}
      </span>
      {attention}
      {children}
    </div>
  );
}

export default RunActivity;

