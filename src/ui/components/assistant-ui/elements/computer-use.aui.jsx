import React, { useState } from 'react';
import { MousePointer2 } from 'lucide-react';

export function ComputerUse({
  url = 'github.com/assistant-ui/assistant-ui/issues',
  action = 'click',
  target = 'Issues tab',
  step = 1,
  totalSteps = 4,
  cursorPos = { left: '22%', top: '18%' },
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="computer-use"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-md flex-col overflow-hidden rounded-2xl ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <span className="flex shrink-0 gap-1">
          <span aria-hidden="true" className="size-2 rounded-full bg-red-500/50" />
          <span aria-hidden="true" className="size-2 rounded-full bg-amber-500/50" />
          <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500/50" />
        </span>
        <span className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] font-mono text-[11px] tracking-tight text-muted-foreground min-w-0 flex-1 truncate rounded-full px-2.5 py-1">
          {url}
        </span>
      </div>

      <div className="relative min-h-[8.5rem] overflow-hidden bg-foreground/[0.01]">
        <div className="flex flex-col gap-2 p-4 opacity-75">
          <span className="bg-foreground/[0.07] h-3 w-28 rounded" />
          <span className="bg-foreground/[0.05] h-2.5 w-full rounded" />
          <span className="bg-foreground/[0.05] h-2.5 w-4/5 rounded" />
          <span className="bg-foreground/[0.05] h-2.5 w-2/3 rounded" />
          <span className="bg-foreground/[0.07] mt-2 h-3 w-20 rounded" />
          <span className="bg-foreground/[0.05] h-2.5 w-3/4 rounded" />
        </div>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-2 rounded-full bg-blue-500 transition-opacity duration-300 dark:bg-blue-400"
          style={{ left: cursorPos.left, top: cursorPos.top, opacity: 0.18 }}
        />
        <MousePointer2
          className="pointer-events-none absolute size-4 fill-blue-500 text-blue-500 transition-[left,top] duration-500 ease-out motion-reduce:transition-none dark:fill-blue-400 dark:text-blue-400"
          aria-hidden="true"
          style={{ left: cursorPos.left, top: cursorPos.top }}
        />
      </div>

      <div className="border-foreground/[0.07] flex items-center gap-2 border-t px-3.5 py-2">
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0 uppercase">
          {action}
        </span>
        <span className="text-foreground/80 min-w-0 flex-1 truncate text-[13px]">
          {target}
        </span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0 tabular-nums">
          {step}/{totalSteps}
        </span>
      </div>
    </div>
  );
}

export default ComputerUse;
