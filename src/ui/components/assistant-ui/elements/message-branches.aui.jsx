import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function MessageBranches({
  branches = [
    'Persist the composer draft in the runtime with the thread id as its key. When the active thread changes, read that value back into the composer.',
    'Store draft state in your local React state or context and restore it whenever the active thread prop changes.',
    'Use the assistant-ui useAssistantContext hook with getContext to bind draft persistence directly to session storage.',
  ],
  initialIndex = 0,
  onChangeBranch,
  className = '',
  ...props
}) {
  const [index, setIndex] = useState(initialIndex);

  const prev = () => {
    const nextIdx = (index - 1 + branches.length) % branches.length;
    setIndex(nextIdx);
    onChangeBranch?.(nextIdx);
  };

  const next = () => {
    const nextIdx = (index + 1) % branches.length;
    setIndex(nextIdx);
    onChangeBranch?.(nextIdx);
  };

  return (
    <div
      data-slot="message-branches"
      className={`flex max-w-sm flex-col gap-2 ${className}`}
      {...props}
    >
      <p className="fade-in slide-in-from-bottom-1 animate-in text-foreground/90 min-h-[4.25rem] text-sm leading-relaxed duration-300 motion-reduce:animate-none">
        {branches[index]}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Show previous response"
          onClick={prev}
          className="flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-6"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
        </button>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground tabular-nums">
          {index + 1} / {branches.length}
        </span>
        <button
          type="button"
          aria-label="Show next response"
          onClick={next}
          className="flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-6"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default MessageBranches;
