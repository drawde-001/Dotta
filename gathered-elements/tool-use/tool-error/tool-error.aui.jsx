import React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';

export function ToolError({
  tool = 'fetch',
  target = 'https://api.example.com/v1/issues',
  attempt = 1,
  maxAttempts = 3,
  error = 'ETIMEDOUT after 30000ms',
  onSkip,
  onRetry,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="tool-error"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-sm flex-col gap-3 rounded-2xl p-3.5 ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle
          className="size-3.5 shrink-0 text-red-500"
          aria-hidden="true"
        />
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground min-w-0 wrap-anywhere">
          {tool}
        </span>
        <span className="text-foreground/80 min-w-0 flex-1 truncate text-[13px]">
          {target}
        </span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0 tabular-nums">
          {attempt}/{maxAttempts}
        </span>
      </div>

      <div className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] rounded-xl px-3 py-2 font-mono text-[11px] leading-relaxed break-words text-red-700 dark:text-red-300">
        {error}
      </div>

      <div className="flex items-center justify-end gap-2">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground/90 h-7 rounded-full px-2.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
          >
            Skip
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground/95 flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
          >
            <RotateCw className="size-3" aria-hidden="true" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export default ToolError;
