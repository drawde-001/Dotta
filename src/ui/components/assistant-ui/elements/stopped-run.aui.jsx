import React from 'react';
import { Square, ArrowRight } from 'lucide-react';

export function StoppedRun({
  text = 'To configure persistent drafts in assistant-ui, use the runtime store hook and attach draft listeners...',
  onContinue,
  onDiscard,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="stopped-run"
      className={`flex w-full max-w-sm flex-col gap-3 ${className}`}
      {...props}
    >
      <p className="text-foreground/80 text-[13.5px] leading-relaxed">
        {text}
        <span
          aria-hidden="true"
          className="bg-foreground/20 ms-1 inline-block h-[1em] w-[2px] translate-y-[0.15em] rounded-full"
        />
      </p>

      <div className="flex items-center gap-2">
        <span className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] font-mono text-[11px] tracking-tight text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
          <Square className="size-2.5 fill-current" aria-hidden="true" />
          stopped by you
        </span>

        {onContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground/95 ms-auto flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
          >
            Continue
            <ArrowRight className="size-3" aria-hidden="true" />
          </button>
        )}

        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground/90 flex h-7 items-center rounded-full px-2.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
          >
            Discard
          </button>
        )}
      </div>
    </div>
  );
}

export default StoppedRun;
