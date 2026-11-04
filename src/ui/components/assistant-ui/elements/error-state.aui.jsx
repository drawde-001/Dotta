import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function ErrorState({
  title = 'Generation stopped',
  description = 'The model hit the output limit after 4,096 tokens.',
  onRetry,
  action,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={`fade-in animate-in flex w-full max-w-md items-start gap-2.5 rounded-2xl bg-red-500/[0.06] border border-red-500/20 px-4 py-3 text-sm duration-300 motion-reduce:animate-none dark:bg-red-500/10 ${className}`}
      {...props}
    >
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-red-500/80"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-red-600 dark:text-red-400">{title}</p>
        {description && (
          <p className="mt-0.5 text-[13px] leading-snug text-red-600/75 dark:text-red-400/80">
            {description}
          </p>
        )}
        {action && (
          <div className="mt-2.5">
            {action}
          </div>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ms-auto shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400 cursor-pointer"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

export default ErrorState;
