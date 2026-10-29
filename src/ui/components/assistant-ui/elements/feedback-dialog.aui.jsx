import React, { useState } from 'react';
import { ThumbsDown } from 'lucide-react';

const DEFAULT_REASONS = [
  'Not factual',
  "Didn't follow instructions",
  'Too long',
  'Unsafe',
];

export function FeedbackDialog({
  title = 'What went wrong?',
  reasons = DEFAULT_REASONS,
  onSubmit,
  className = '',
  ...props
}) {
  const [selectedReasons, setSelectedReasons] = useState(new Set());
  const [comments, setComments] = useState('');

  const toggleReason = (reason) => {
    setSelectedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit?.({
      reasons: Array.from(selectedReasons),
      comments,
    });
  };

  return (
    <div
      data-slot="feedback-dialog"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-sm rounded-[20px] p-4 flex-col gap-3 ${className}`}
      {...props}
    >
      <div role="status" className="sr-only" />
      <div className="flex items-center gap-2.5">
        <span className="bg-foreground/[0.05] text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
          <ThumbsDown className="size-3.5" aria-hidden="true" />
        </span>
        <span className="text-[13.5px] font-medium text-foreground">{title}</span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground ms-auto">
          optional
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {reasons.map((r) => {
          const isSelected = selectedReasons.has(r);
          return (
            <button
              key={r}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleReason(r)}
              className={`rounded-full px-2.5 py-1 text-xs transition-[background-color,color,scale] duration-150 active:scale-[0.96] ${
                isSelected
                  ? 'bg-foreground text-background shadow-xs'
                  : 'bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] text-muted-foreground hover:text-foreground/90'
              }`}
            >
              {r}
            </button>
          );
        })}
      </div>

      <textarea
        rows={2}
        placeholder="Anything else?"
        aria-label="Anything else?"
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] text-foreground/80 placeholder:text-muted-foreground focus-visible:ring-foreground/20 resize-none rounded-xl px-3 py-2 text-xs outline-none focus-visible:ring-1"
      />

      <button
        type="button"
        onClick={handleSubmit}
        className="bg-foreground text-background transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.96] motion-reduce:transition-none forced-colors:border flex h-8 items-center justify-center self-end rounded-full px-3.5 text-xs font-medium"
      >
        Send feedback
      </button>
    </div>
  );
}

export default FeedbackDialog;
