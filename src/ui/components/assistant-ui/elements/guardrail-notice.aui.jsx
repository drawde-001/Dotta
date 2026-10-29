import React from 'react';
import { Shield } from 'lucide-react';

export function GuardrailNotice({
  title = "I can't help with that",
  tag = 'policy',
  reason = "This asks for a working attack against infrastructure you don't own. I can help with the defensive side of the same problem.",
  suggestions = [
    'Explain how rate limiting defends against this',
    'Review my own service for the same weakness',
  ],
  onSelectSuggestion,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="guardrail-notice"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-sm flex-col gap-3 rounded-[20px] p-4 ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
          <Shield className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
          {title}
        </span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0">
          {tag}
        </span>
      </div>

      {reason && (
        <p className="text-foreground/60 text-xs leading-relaxed">
          {reason}
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
            try instead
          </span>
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectSuggestion?.(suggestion)}
              className="hover:bg-foreground/[0.04] text-foreground/70 hover:text-foreground/95 -mx-1.5 rounded-lg px-1.5 py-1 text-start text-[13px] transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default GuardrailNotice;
