import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

const DEFAULT_HUNKS = [
  {
    header: '@@ -12,6 +12,7 @@',
    lines: [
      { type: 'neutral', text: '  const composer = useComposer();' },
      { type: 'remove', text: '  const [draft, setDraft] = useState("");' },
      { type: 'add', text: '  const draft = useDraft(threadId);' },
    ],
  },
  {
    header: '@@ -24,4 +25,5 @@',
    lines: [
      { type: 'neutral', text: '  return (' },
      { type: 'add', text: '    <form onSubmit={composer.send}>' },
    ],
  },
];

export function ReviewableDiff({
  filename = 'composer.tsx',
  hunks = DEFAULT_HUNKS,
  onHunkDecision,
  className = '',
  ...props
}) {
  const [decisions, setDecisions] = useState({}); // hunkIdx -> 'kept' | 'discarded'

  const handleDecision = (idx, decision) => {
    setDecisions((prev) => ({ ...prev, [idx]: decision }));
    onHunkDecision?.(idx, decision);
  };

  const keptCount = Object.values(decisions).filter((v) => v === 'kept').length;

  return (
    <div
      data-slot="reviewable-diff"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-md flex-col overflow-hidden rounded-2xl ${className}`}
      {...props}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-mono text-xs text-foreground/90 font-medium">{filename}</span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground tabular-nums">
          {keptCount} of {hunks.length} kept
        </span>
      </div>

      <div className="flex flex-col">
        {hunks.map((hunk, idx) => {
          const decision = decisions[idx];
          return (
            <div
              key={idx}
              className={`border-foreground/[0.06] border-t transition-opacity duration-300 ${
                decision === 'discarded' ? 'opacity-40 line-through' : ''
              }`}
            >
              <div className="flex items-center gap-2 px-4 py-1.5 bg-foreground/[0.02]">
                <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
                  {hunk.header}
                </span>
                <span className="ms-auto flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Discard hunk ${hunk.header}`}
                    onClick={() => handleDecision(idx, 'discarded')}
                    className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground/90 flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
                  >
                    <X className="size-3" aria-hidden="true" />
                    Discard
                  </button>
                  <button
                    type="button"
                    aria-label={`Keep hunk ${hunk.header}`}
                    onClick={() => handleDecision(idx, 'kept')}
                    className={`flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-[background-color,scale] duration-150 active:scale-[0.96] ${
                      decision === 'kept'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
                    }`}
                  >
                    <Check className="size-3" aria-hidden="true" />
                    Keep
                  </button>
                </span>
              </div>

              <div className="overflow-x-auto pb-1.5 font-mono text-xs">
                <div className="w-max min-w-full">
                  {hunk.lines.map((l, lIdx) => {
                    const isAdd = l.type === 'add';
                    const isRemove = l.type === 'remove';
                    const lineClass = isAdd
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : isRemove
                      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'text-muted-foreground';

                    return (
                      <div
                        key={lIdx}
                        className={`flex px-4 py-0.5 leading-relaxed whitespace-pre ${lineClass}`}
                      >
                        <span className="w-4 shrink-0 select-none font-bold">
                          {isAdd ? '+' : isRemove ? '−' : ''}
                        </span>
                        <span>{l.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ReviewableDiff;
