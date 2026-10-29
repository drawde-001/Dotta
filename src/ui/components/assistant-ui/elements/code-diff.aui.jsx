import React from 'react';

const DEFAULT_LINES = [
  { type: 'neutral', text: 'export function Composer() {' },
  { type: 'neutral', text: '  const threadId = useThreadId();' },
  { type: 'neutral', text: '  const composer = useComposer();' },
  { type: 'remove', text: '  const [draft, setDraft] = useState("");' },
  { type: 'add', text: '  const draft = useDraft(threadId);' },
  { type: 'add', text: '  useEffect(() => hydrate(draft), [threadId]);' },
  { type: 'neutral', text: '  return (' },
  { type: 'neutral', text: '    <form onSubmit={composer.send}>' },
];

export function CodeDiff({
  filename = 'composer.tsx',
  addCount = 2,
  removeCount = 1,
  lines = DEFAULT_LINES,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="code-diff"
      className={`bg-background border border-border/60 dark:bg-popover w-full max-w-md overflow-hidden rounded-2xl font-mono text-xs ${className}`}
      {...props}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/30">
        <span className="text-foreground/90 font-medium">{filename}</span>
        <span className="font-mono text-[11px] tracking-tight tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{addCount}</span>{' '}
          <span className="text-red-600 dark:text-red-400">−{removeCount}</span>
        </span>
      </div>

      <div className="overflow-x-auto py-2">
        <div className="w-max min-w-full">
          {lines.map((line, idx) => {
            const isAdd = line.type === 'add';
            const isRemove = line.type === 'remove';
            const lineClass = isAdd
              ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
              : isRemove
              ? 'bg-red-500/10 text-red-700 dark:text-red-300'
              : 'text-muted-foreground';

            return (
              <div
                key={idx}
                className={`fade-in animate-in fill-mode-both flex px-4 py-0.5 leading-relaxed whitespace-pre duration-300 ${lineClass}`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <span className="w-4 shrink-0 select-none font-bold">
                  {isAdd ? '+' : isRemove ? '−' : ''}
                </span>
                <span>{line.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CodeDiff;
