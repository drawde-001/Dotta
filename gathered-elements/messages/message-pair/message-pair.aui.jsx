import React from 'react';
import { Copy, RefreshCw } from 'lucide-react';

export function MessagePair({
  userMessage = 'How do I persist composer drafts across threads?',
  assistantMessage = 'Persist the composer draft in the runtime with the thread id as its key. When the active thread changes, read that value back into the composer.',
  onCopy,
  onRegenerate,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="message-pair"
      className={`flex w-full max-w-sm flex-col gap-5 ${className}`}
      {...props}
    >
      <p className="max-w-[85%] self-end text-sm bg-background dark:bg-popover rounded-2xl px-3.5 py-2 text-foreground">
        {userMessage}
      </p>
      <div className="group/message flex flex-col items-start">
        <p className="min-h-[4.25rem] text-sm leading-relaxed text-foreground/90">
          {assistantMessage}
        </p>
        <div className="flex items-center gap-1 pt-1 opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100 motion-reduce:transition-none">
          <button
            type="button"
            aria-label="Copy response"
            onClick={onCopy}
            className="flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-7"
          >
            <Copy className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Regenerate response"
            onClick={onRegenerate}
            className="flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-7"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default MessagePair;
