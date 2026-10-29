import React from 'react';
import { ArrowUp, X } from 'lucide-react';

export function MessageQueue({
  currentTask = 'Fix the converter and add a guard',
  queue = [
    'Also add a changeset',
    'Then run the full suite',
  ],
  onRemoveItem,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="message-queue"
      className={`flex w-full max-w-sm flex-col gap-2 ${className}`}
      {...props}
    >
      <div className="bg-background border border-border/60 dark:bg-popover flex items-center gap-2.5 rounded-2xl p-3">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-500/60 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-blue-500 dark:bg-blue-400" />
        </span>
        <span className="text-foreground/90 min-w-0 flex-1 truncate text-[13.5px]">
          {currentTask}
        </span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0">
          running
        </span>
      </div>

      <div className="flex items-baseline justify-between px-1">
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
          {queue.length} queued
        </span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
          sends when this finishes
        </span>
      </div>

      {queue.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {queue.map((item, idx) => (
            <li
              key={idx}
              className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex items-center gap-2.5 rounded-2xl py-2 pr-2 pl-3 duration-300"
            >
              <span className="font-mono text-[11px] tracking-tight text-muted-foreground w-3 shrink-0 tabular-nums">
                {idx + 1}
              </span>
              <span className="text-foreground/60 min-w-0 flex-1 truncate text-[13.5px]">
                {item}
              </span>
              <ArrowUp
                className="text-foreground/25 size-3 shrink-0"
                aria-hidden="true"
              />
              <button
                type="button"
                aria-label={`Remove "${item}" from the queue`}
                onClick={() => onRemoveItem?.(idx)}
                className="flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-6 shrink-0"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MessageQueue;
