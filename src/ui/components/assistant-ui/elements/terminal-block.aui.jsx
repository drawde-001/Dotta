import React from 'react';
import { Loader2, Check, X } from 'lucide-react';

export function TerminalBlock({
  command = 'pnpm vitest run composer',
  state = 'running', // 'running' | 'done' | 'failed'
  output = ['RUN v4.0.5 /apps/docs', '✓ tests/composer.test.ts (4)'],
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="terminal-block"
      data-state={state}
      className={`bg-background border border-border/60 dark:bg-popover w-full max-w-md overflow-hidden rounded-2xl font-mono text-xs ${className}`}
      {...props}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1.5 border-b border-border/30">
        <span className="min-w-0 break-words text-foreground/90 font-medium">
          {command}
        </span>
        {state === 'running' && (
          <Loader2
            className="size-3 animate-spin motion-reduce:animate-none text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        )}
        {state === 'done' && (
          <Check
            className="size-3 text-emerald-500 shrink-0"
            aria-hidden="true"
          />
        )}
        {state === 'failed' && (
          <X
            className="size-3 text-red-500 shrink-0"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="flex min-h-[7rem] flex-col gap-1 px-4 pt-2.5 pb-3.5 text-muted-foreground">
        <div className="flex flex-col gap-1">
          {output.map((line, idx) => (
            <div
              key={idx}
              className="fade-in animate-in fill-mode-both break-words whitespace-pre-wrap duration-300 motion-reduce:animate-none text-foreground/90"
            >
              <span>{line}</span>
            </div>
          ))}
        </div>
        {state === 'running' && (
          <span
            aria-hidden="true"
            className="inline-block h-3 w-1.5 animate-pulse bg-blue-500/70 motion-reduce:animate-none dark:bg-blue-400/70 mt-1"
          />
        )}
      </div>
    </div>
  );
}

export default TerminalBlock;
