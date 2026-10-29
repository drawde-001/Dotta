import React from 'react';
import { Loader2, Check } from 'lucide-react';

const DEFAULT_STEPS = [
  {
    title: 'Read existing composer state',
    description: 'Trace the current data flow before changing it.',
    status: 'running',
  },
  { title: 'Design the draft store', status: 'pending' },
  { title: 'Wire runtime persistence', status: 'pending' },
  { title: 'Add regression tests', status: 'pending' },
  { title: 'Update docs', status: 'pending' },
];

export function AgentPlan({
  title = 'Composer draft',
  steps = DEFAULT_STEPS,
  className = '',
  ...props
}) {
  const completedCount = steps.filter((s) => s.status === 'completed' || s.status === 'done').length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div
      data-slot="agent-plan"
      className={`flex w-full max-w-sm flex-col gap-3 ${className}`}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-medium text-foreground">{title}</span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground tabular-nums">
          {completedCount} of {steps.length}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`${title} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-valuetext={`${completedCount} of ${steps.length} steps`}
        className="bg-foreground/[0.06] inset-ring-border h-[3px] w-full overflow-hidden rounded-full inset-ring forced-colors:outline"
      >
        <span
          aria-hidden="true"
          className="bg-foreground/80 block h-full rounded-full transition-[width] duration-500 forced-color-adjust-none motion-reduce:transition-none"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ul className="flex flex-col gap-2.5">
        {steps.map((st, idx) => {
          const isRunning = st.status === 'running';
          const isDone = st.status === 'completed' || st.status === 'done';

          return (
            <li
              key={idx}
              className={`flex gap-2.5 text-[13.5px] ${
                st.description ? 'items-start' : 'items-center'
              }`}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {isRunning && (
                  <Loader2
                    className="lucide-loader-2 text-foreground/90 size-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {isDone && (
                  <Check
                    className="size-3.5 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                )}
                {!isRunning && !isDone && (
                  <span
                    aria-hidden="true"
                    className="bg-foreground/15 inset-ring-border size-1.5 rounded-full inset-ring forced-colors:border"
                  />
                )}
              </span>

              <span className="min-w-0">
                <span
                  className={
                    isRunning
                      ? 'text-foreground/90 font-medium'
                      : isDone
                      ? 'text-foreground/70'
                      : 'text-muted-foreground'
                  }
                >
                  {st.title}
                </span>
                {st.description && (
                  <span className="text-muted-foreground mt-0.5 block text-xs leading-normal">
                    {st.description}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default AgentPlan;
