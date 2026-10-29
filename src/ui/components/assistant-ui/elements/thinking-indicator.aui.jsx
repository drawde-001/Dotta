"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { mono, ShimmerLabel } from "./surfaces";

export function ThinkingIndicator({
  label = "Thinking",
  elapsed,
  className,
  ...props
}) {
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
        key={label}
        className="fade-in slide-in-from-bottom-1 animate-in relative inline-block min-w-0 truncate leading-tight duration-300"
      >
        {label}
      </ShimmerLabel>
      {elapsed !== undefined && (
        <span
          className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}
        >
          {elapsed}
        </span>
      )}
    </div>
  );
}

export default ThinkingIndicator;
