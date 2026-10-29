"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { mono, ShimmerLabel } from "./surfaces";

const DEFAULT_THINKING_LABELS = [
  "Thinking",
  "Analyzing request",
  "Planning next steps",
  "Synthesizing response",
];

export function ThinkingIndicator({
  label = "Thinking",
  labels,
  cycle = true,
  cycleIntervalMs = 2600,
  elapsed,
  startTime,
  className,
  ...props
}) {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [liveElapsed, setLiveElapsed] = useState(undefined);

  const cyclePool =
    Array.isArray(labels) && labels.length > 0
      ? labels
      : label === "Thinking" && cycle
        ? DEFAULT_THINKING_LABELS
        : null;

  useEffect(() => {
    setCycleIndex(0);
  }, [label]);

  useEffect(() => {
    if (!cyclePool || cyclePool.length <= 1) return undefined;
    const id = setInterval(() => {
      setCycleIndex((prev) => (prev + 1) % cyclePool.length);
    }, cycleIntervalMs);
    return () => clearInterval(id);
  }, [cyclePool, cycleIntervalMs]);

  useEffect(() => {
    if (elapsed !== undefined || !startTime) {
      setLiveElapsed(undefined);
      return undefined;
    }
    const update = () => {
      const diffSec = Math.max(0, (Date.now() - startTime) / 1000);
      if (diffSec < 60) {
        setLiveElapsed(`${diffSec.toFixed(1)}s`);
      } else {
        const mins = Math.floor(diffSec / 60);
        const rem = Math.round(diffSec % 60);
        setLiveElapsed(`${mins}m ${rem}s`);
      }
    };
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [elapsed, startTime]);

  const activeLabel = cyclePool ? cyclePool[cycleIndex] : label;
  const resolvedElapsed = elapsed !== undefined ? elapsed : liveElapsed;

  return (
    <div
      data-slot="thinking-indicator"
      className={cn(
        "text-muted-foreground flex items-center gap-2.5 text-sm",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none dark:bg-blue-400"
      />
      <ShimmerLabel
        key={activeLabel}
        className="fade-in slide-in-from-bottom-1 animate-in relative inline-block min-w-0 truncate leading-tight duration-300"
      >
        {activeLabel}
      </ShimmerLabel>
      {resolvedElapsed !== undefined && (
        <span
          className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}
        >
          {resolvedElapsed}
        </span>
      )}
    </div>
  );
}

export default ThinkingIndicator;

