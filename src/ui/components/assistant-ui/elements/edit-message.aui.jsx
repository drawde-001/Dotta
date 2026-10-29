import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export function EditMessage({
  initialValue = 'Explain how the composer keeps its draft.',
  discardCount = 3,
  onSave,
  onCancel,
  className = '',
  ...props
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div
      data-slot="edit-message"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-sm flex-col gap-3 rounded-[20px] p-3.5 ${className}`}
      {...props}
    >
      <textarea
        rows={2}
        aria-label="Edit your message"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] text-foreground/90 focus-visible:ring-foreground/20 resize-none rounded-xl px-3 py-2.5 text-[13.5px] leading-relaxed outline-none focus-visible:ring-1"
      />
      {discardCount > 0 && (
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="font-mono text-[11px] tracking-tight tabular-nums">
            sending discards {discardCount} replies
          </span>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 rounded-full px-3.5 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave?.(value)}
          className="bg-foreground text-background transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.96] motion-reduce:transition-none forced-colors:border flex h-8 items-center rounded-full px-3.5 text-xs font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default EditMessage;
