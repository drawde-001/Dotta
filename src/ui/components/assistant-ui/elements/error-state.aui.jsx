import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function ErrorState({
  title = 'Generation stopped',
  description = 'The model hit the output limit after 4,096 tokens.',
  onRetry,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={`fade-in animate-in flex w-full max-w-sm items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm duration-300 motion-reduce:animate-none dark:bg-red-500/10 ${className}`}
      {...props}
    >
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-red-500/80"
        aria-hidden="true"
      />
      <div>
        <p className="font-medium text-red-600 dark:text-red-400">{title}</p>
        {description && (
          <p className="mt-0.5 text-[13px] leading-snug text-red-600/60 dark:text-red-400/60">
            {description}
          </p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ms-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

export default ErrorState;
