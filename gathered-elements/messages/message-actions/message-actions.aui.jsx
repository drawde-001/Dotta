import React, { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, RefreshCw } from 'lucide-react';

export function MessageActions({
  onCopy,
  onThumbsUp,
  onThumbsDown,
  onRegenerate,
  className = '',
  ...props
}) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(null); // 'up' | 'down' | null

  const handleCopy = () => {
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleThumbsUp = () => {
    const next = rating === 'up' ? null : 'up';
    setRating(next);
    onThumbsUp?.(next);
  };

  const handleThumbsDown = () => {
    const next = rating === 'down' ? null : 'down';
    setRating(next);
    onThumbsDown?.(next);
  };

  const buttonClass =
    'items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-7 grid place-items-center';

  return (
    <div
      data-slot="message-actions"
      className={`flex items-center gap-1 ${className}`}
      {...props}
    >
      <button
        type="button"
        aria-label="Copy response"
        onClick={handleCopy}
        className={buttonClass}
      >
        <span className="[grid-area:1/1] transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none">
          {copied ? (
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </span>
      </button>

      <button
        type="button"
        aria-label="Mark response helpful"
        aria-pressed={rating === 'up'}
        onClick={handleThumbsUp}
        className={`${buttonClass} ${
          rating === 'up' ? 'text-foreground bg-foreground/[0.08]' : ''
        }`}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label="Mark response unhelpful"
        aria-pressed={rating === 'down'}
        onClick={handleThumbsDown}
        className={`${buttonClass} ${
          rating === 'down' ? 'text-foreground bg-foreground/[0.08]' : ''
        }`}
      >
        <ThumbsDown className="size-3.5" aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label="Regenerate response"
        onClick={onRegenerate}
        className={buttonClass}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default MessageActions;
