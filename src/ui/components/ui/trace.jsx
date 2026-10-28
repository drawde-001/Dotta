import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Trace({ className, children, ...props }) {
  return (
    <div
      data-slot="trace"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function TraceLine({
  className,
  status = "default",
  children,
  ...props
}) {
  const statusStyles = {
    default: "text-zinc-300",
    running: "text-zinc-100 [&_[data-slot=trace-title]]:font-medium",
    done: "text-zinc-400",
    error: "text-red-400",
    pending: "text-zinc-500 opacity-60"
  };

  return (
    <div
      data-slot="trace-line"
      data-status={status}
      className={cn(
        "group/traceline relative flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors select-none hover:bg-white/[0.03]",
        statusStyles[status] || statusStyles.default,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function TraceIcon({ className, children, ...props }) {
  return (
    <span
      data-slot="trace-icon"
      className={cn(
        "flex w-4 h-4 shrink-0 items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5 text-zinc-400",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function TraceTitle({ className, children, ...props }) {
  return (
    <span
      data-slot="trace-title"
      className={cn("flex-1 truncate font-medium text-xs text-zinc-200", className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function TraceDescription({ className, children, ...props }) {
  return (
    <span
      data-slot="trace-description"
      className={cn("text-[11px] font-mono text-zinc-400 ml-auto shrink-0", className)}
      {...props}
    >
      {children}
    </span>
  );
}

// Lightweight Collapsible Context for zero-dependency collapsible behavior
const TraceCollapsibleContext = React.createContext({
  isOpen: true,
  toggle: () => {}
});

export function TraceCollapsible({
  defaultOpen = true,
  className,
  children,
  ...props
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const toggle = () => setIsOpen((prev) => !prev);

  return (
    <TraceCollapsibleContext.Provider value={{ isOpen, toggle }}>
      <div
        data-slot="trace-collapsible"
        data-state={isOpen ? "open" : "closed"}
        className={cn("w-full", className)}
        {...props}
      >
        {children}
      </div>
    </TraceCollapsibleContext.Provider>
  );
}

export function TraceCollapsibleTrigger({
  className,
  children,
  ...props
}) {
  const { isOpen, toggle } = React.useContext(TraceCollapsibleContext);

  return (
    <div
      data-slot="trace-collapsible-trigger"
      onClick={toggle}
      className={cn(
        "flex w-full items-center justify-between text-left cursor-pointer select-none",
        className
      )}
      {...props}
    >
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        {children}
      </div>
      <TraceIcon
        data-slot="trace-chevron"
        className={cn(
          "transition-transform duration-200 text-zinc-400 mr-1",
          isOpen ? "rotate-90" : "rotate-0"
        )}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </TraceIcon>
    </div>
  );
}

export function TraceCollapsibleContent({
  className,
  children,
  ...props
}) {
  const { isOpen } = React.useContext(TraceCollapsibleContext);
  if (!isOpen) return null;

  return (
    <div
      data-slot="trace-collapsible-content"
      data-state={isOpen ? "open" : "closed"}
      className={cn(
        "overflow-hidden text-xs pl-5 ml-3 border-l border-white/10 my-1 animate-in fade-in duration-150",
        className
      )}
      {...props}
    >
      <div className="py-0.5 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
