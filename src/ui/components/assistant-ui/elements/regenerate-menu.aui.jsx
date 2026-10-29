import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

const DEFAULT_OPTIONS = [
  { label: 'Try again with Opus 5', hint: 'slower' },
  { label: 'Try again with Sonnet 5', hint: 'current' },
  { label: 'Try again with Haiku 4.5', hint: 'fastest' },
];

export function RegenerateMenu({
  options = DEFAULT_OPTIONS,
  onSelectOption,
  className = '',
  ...props
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-slot="regenerate-menu"
      className={`relative flex w-full max-w-sm flex-col gap-2 ${className}`}
      {...props}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label="Regenerate with a different model"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center justify-center rounded-full outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-7 self-start ${
          open
            ? 'bg-foreground/[0.06] text-foreground/90'
            : 'text-muted-foreground'
        }`}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div className="bg-background border border-border/60 dark:bg-popover fade-in zoom-in-95 slide-in-from-top-1 animate-in flex flex-col gap-0.5 rounded-2xl p-1.5 duration-200 shadow-lg">
          {options.map((opt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onSelectOption?.(opt);
                setOpen(false);
              }}
              className="hover:bg-foreground/[0.05] flex items-baseline gap-2 rounded-xl px-2.5 py-1.5 text-start transition-colors"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                {opt.label}
              </span>
              {opt.hint && (
                <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0">
                  {opt.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default RegenerateMenu;
