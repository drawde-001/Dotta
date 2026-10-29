import React from 'react';

export function TypingIndicator({
  variant = 'bubble',
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="typing-indicator"
      data-variant={variant}
      className={`bg-background border border-border/60 dark:bg-popover w-fit rounded-full px-4 py-3.5 ${className}`}
      {...props}
    >
      <div role="status" aria-label="Assistant is typing" className="flex gap-1">
        <span
          aria-hidden="true"
          className="bg-foreground/40 size-1.5 animate-bounce rounded-full motion-reduce:animate-none"
          style={{ animationDelay: '-0.32s', animationDuration: '1.1s' }}
        />
        <span
          aria-hidden="true"
          className="bg-foreground/40 size-1.5 animate-bounce rounded-full motion-reduce:animate-none"
          style={{ animationDelay: '-0.16s', animationDuration: '1.1s' }}
        />
        <span
          aria-hidden="true"
          className="bg-foreground/40 size-1.5 animate-bounce rounded-full motion-reduce:animate-none"
          style={{ animationDelay: '0s', animationDuration: '1.1s' }}
        />
      </div>
    </div>
  );
}

export default TypingIndicator;
