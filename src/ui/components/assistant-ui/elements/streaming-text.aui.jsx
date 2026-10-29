import React from 'react';

export function StreamingText({
  text = '',
  isStreaming = true,
  className = '',
  ...props
}) {
  return (
    <p
      data-slot="streaming-text"
      className={`min-h-[1.5rem] max-w-prose text-sm leading-relaxed text-pretty text-foreground ${className}`}
      {...props}
    >
      {text}
      {isStreaming && (
        <span
          aria-hidden="true"
          className="inline-block size-1.5 rounded-full bg-foreground/80 align-middle ml-1 animate-pulse"
        />
      )}
    </p>
  );
}

export default StreamingText;
