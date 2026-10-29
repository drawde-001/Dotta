import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

export function ToolCall({
  toolName = 'Searching the docs',
  completedName = 'Searched the docs',
  argument = 'draft persistence',
  result,
  isComplete = false,
  className = '',
  ...props
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-slot="tool-call"
      data-state={open ? 'open' : 'closed'}
      className={`w-full max-w-sm ${className}`}
      {...props}
    >
      <button
        type="button"
        tabIndex={0}
        aria-expanded={open}
        data-slot="collapsible-trigger"
        onClick={() => setOpen((prev) => !prev)}
        className="group/trigger text-muted-foreground hover:text-foreground/90 flex w-full items-center gap-2 rounded-md py-1 text-[13.5px] transition-colors outline-none text-start cursor-pointer"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        />
        <span className="grid overflow-x-clip transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none shrink-0 text-start whitespace-nowrap">
          {!isComplete ? (
            <span
              aria-hidden="false"
              className="col-start-1 row-start-1 flex w-max items-center gap-1.5 leading-none transition-[opacity,filter] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none opacity-100 blur-none"
            >
              <span className="shimmer motion-reduce:animate-none relative inline-block leading-none">
                {toolName}
              </span>
            </span>
          ) : (
            <span
              aria-hidden="false"
              className="col-start-1 row-start-1 flex w-max items-center gap-1.5 leading-none transition-[opacity,filter] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none opacity-100 blur-none"
            >
              <span>{completedName}</span>
            </span>
          )}
        </span>
        {argument && (
          <span className="font-mono text-[11px] tracking-tight bg-foreground/[0.06] text-foreground/70 min-w-0 truncate rounded-md px-1.5 py-0.5">
            {argument}
          </span>
        )}
        <span className="ms-auto flex w-4 shrink-0 items-center justify-end" />
      </button>

      {open && (
        <div
          data-slot="tool-call-content"
          className="bg-foreground/[0.025] border border-border/50 rounded-xl p-3 mt-1.5 font-mono text-[12px] leading-relaxed overflow-x-auto text-foreground/80 fade-in animate-in duration-200"
        >
          {result ? (
            typeof result === 'object' ? (
              <pre>{JSON.stringify(result, null, 2)}</pre>
            ) : (
              <span>{String(result)}</span>
            )
          ) : (
            <span className="text-muted-foreground">Running...</span>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCall;
