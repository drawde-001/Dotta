import React, { useState } from 'react';

const EFFORTS = ['Low', 'Medium', 'High', 'Max'];

export function ReasoningEffort({
  currentEffort = 'High',
  usedTokens = 3360,
  maxTokens = 24000,
  onChange,
  className = '',
  ...props
}) {
  const [effort, setEffort] = useState(currentEffort);

  const handleSelect = (level) => {
    setEffort(level);
    onChange?.(level);
  };

  const percentage = Math.min(100, Math.round((usedTokens / maxTokens) * 100));

  return (
    <div
      data-slot="reasoning-effort"
      className={`flex w-full max-w-sm flex-col gap-2.5 ${className}`}
      {...props}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] font-medium text-foreground">Thinking</span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground tabular-nums">
          {usedTokens.toLocaleString()} / {maxTokens.toLocaleString()}
        </span>
      </div>

      <div className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] flex gap-0.5 rounded-full p-0.5">
        {EFFORTS.map((lvl) => {
          const isActive = effort === lvl;
          return (
            <button
              key={lvl}
              type="button"
              aria-pressed={isActive}
              onClick={() => handleSelect(lvl)}
              className={`flex-1 rounded-full py-1 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.97] ${
                isActive
                  ? 'bg-background text-foreground/90 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground/70'
              }`}
            >
              {lvl}
            </button>
          );
        })}
      </div>

      <span
        role="progressbar"
        aria-label="Thinking budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-valuetext={`${usedTokens.toLocaleString()} of ${maxTokens.toLocaleString()}`}
        className="bg-foreground/[0.06] inset-ring-border h-[3px] w-full overflow-hidden rounded-full inset-ring forced-colors:outline"
      >
        <span
          className="block h-full rounded-full bg-blue-500 transition-[width] duration-500 forced-color-adjust-none motion-reduce:transition-none dark:bg-blue-400"
          style={{ width: `${percentage}%` }}
        />
      </span>
    </div>
  );
}

export default ReasoningEffort;
