import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

export function RunActivity({
  status = 'running', // 'running' | 'complete' | 'error'
  title = 'Working',
  description = 'Inspecting the files',
  children,
  className = '',
  ...props
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-slot="run-activity"
      data-status={status}
      className={`flex min-w-0 flex-col gap-3 ${className}`}
      {...props}
    >
      <div data-slot="collapsible" data-state={open ? 'open' : 'closed'}>
        <button
          type="button"
          tabIndex={0}
          aria-expanded={open}
          aria-busy={status === 'running'}
          data-slot="collapsible-trigger"
          onClick={() => setOpen((prev) => !prev)}
          className="group/trigger text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex max-w-full items-center gap-1.5 rounded-md py-1 text-sm outline-none focus-visible:ring-[3px] text-start cursor-pointer"
        >
          <ChevronRight
            className={`size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
              open ? 'rotate-90' : ''
            }`}
            aria-hidden="true"
          />
          <span className="text-start tabular-nums">{title}</span>
        </button>

        {!open && description && (
          <p className="text-muted-foreground ps-5 text-sm wrap-anywhere">
            {description}
          </p>
        )}

        {open && children && (
          <div className="ps-5 pt-2 text-sm text-foreground/80 fade-in animate-in duration-150">
            {children}
          </div>
        )}
      </div>
      <span role="status" aria-atomic="true" class="sr-only">
        {title}
      </span>
    </div>
  );
}

export default RunActivity;
