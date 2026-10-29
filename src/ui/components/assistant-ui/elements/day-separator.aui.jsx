import React from 'react';

export function DaySeparator({
  label = 'Today',
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="day-separator"
      className={`flex items-center gap-2.5 py-1 w-full ${className}`}
      {...props}
    >
      <span className="bg-foreground/[0.08] h-px flex-1" />
      <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
        {label}
      </span>
      <span className="bg-foreground/[0.08] h-px flex-1" />
    </div>
  );
}

export default DaySeparator;
