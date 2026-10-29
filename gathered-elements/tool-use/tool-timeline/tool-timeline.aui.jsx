import React, { useState } from 'react';
import { ChevronRight, Sparkles, FileCode, CheckCircle2 } from 'lucide-react';

const DEFAULT_STEPS = [
  { icon: Sparkles, text: 'Planning changes', detail: 'Analyzed codebase' },
  { icon: FileCode, text: 'Updated convertMessages', detail: 'src/core/converter.ts' },
  { icon: CheckCircle2, text: 'Ran smoke tests', detail: '7/7 passed' },
];

export function ToolTimeline({
  summary = '4 steps · 2 files changed',
  steps = DEFAULT_STEPS,
  className = '',
  ...props
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      data-slot="tool-timeline"
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
        className="group/trigger text-muted-foreground hover:text-foreground/90 flex items-center gap-1.5 rounded-md py-1 text-[13.5px] transition-colors outline-none cursor-pointer text-start"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        />
        <span className="text-start tabular-nums font-medium text-foreground/85">
          {summary}
        </span>
      </button>

      {open && (
        <div
          data-slot="collapsible-content"
          className="overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none"
        >
          <div className="flex flex-col gap-2.5 ps-4 pt-2.5">
            {steps.map((st, idx) => {
              const IconComp = st.icon || Sparkles;
              return (
                <div
                  key={idx}
                  className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground flex items-center gap-2 text-[13.5px] duration-300"
                >
                  <IconComp
                    className="size-3.5 shrink-0 text-muted-foreground/80"
                    aria-hidden="true"
                  />
                  <span className="text-foreground/90">{st.text}</span>
                  {st.detail && (
                    <span className="font-mono text-[11px] tracking-tight bg-foreground/[0.04] text-muted-foreground/80 rounded-md px-1.5 py-0.5 ms-auto truncate max-w-36">
                      {st.detail}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ToolTimeline;
