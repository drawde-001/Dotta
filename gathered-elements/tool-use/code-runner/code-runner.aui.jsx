import React, { useState } from 'react';
import { Play } from 'lucide-react';

const DEFAULT_CODE = `const queue = createMessageQueue(driver);
queue.enqueue("also add a changeset");
console.log(queue.size);`;

const DEFAULT_OUTPUT = ['1', '→ drains when the run settles'];

export function CodeRunner({
  language = 'typescript',
  duration = '38ms',
  initialCode = DEFAULT_CODE,
  initialOutput = DEFAULT_OUTPUT,
  onRun,
  className = '',
  ...props
}) {
  const [output, setOutput] = useState(initialOutput);

  const handleRun = () => {
    onRun?.(initialCode);
  };

  return (
    <div
      data-slot="code-runner"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-md flex-col overflow-hidden rounded-2xl ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2 px-3.5 py-2">
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground min-w-0 flex-1">
          {language}
        </span>
        {duration && (
          <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0 tabular-nums">
            {duration}
          </span>
        )}
        <button
          type="button"
          aria-label="Run this snippet"
          onClick={handleRun}
          className="flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-7 shrink-0 cursor-pointer"
        >
          <Play className="size-3.5 translate-x-px" aria-hidden="true" />
        </button>
      </div>

      <pre className="border-foreground/[0.07] overflow-x-auto border-t px-3.5 py-2.5 font-mono text-xs leading-relaxed">
        <code className="text-foreground/75 whitespace-pre">{initialCode}</code>
      </pre>

      {output && output.length > 0 && (
        <div className="border-foreground/[0.07] fade-in animate-in flex flex-col border-t px-3.5 py-2.5 duration-300">
          <span className="font-mono text-[11px] tracking-tight text-muted-foreground pb-1">
            output
          </span>
          <div className="overflow-x-auto">
            <div className="w-max min-w-full flex flex-col">
              {output.map((line, idx) => (
                <span
                  key={idx}
                  className="fade-in animate-in fill-mode-both font-mono text-xs leading-relaxed whitespace-pre text-foreground/70"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  {line}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeRunner;
