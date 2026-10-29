import React from 'react';

export function ThinkingIndicator({
  label = 'Thinking',
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="thinking-indicator"
      className={`text-muted-foreground flex items-center gap-2.5 text-sm ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none dark:bg-blue-400"
      />
      <span className="shimmer motion-reduce:animate-none fade-in slide-in-from-bottom-1 animate-in relative inline-block min-w-0 truncate leading-tight duration-300">
        {label}
      </span>
    </div>
  );
}

export default ThinkingIndicator;
