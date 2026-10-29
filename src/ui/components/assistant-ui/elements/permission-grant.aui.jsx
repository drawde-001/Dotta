import React from 'react';
import { KeyRound } from 'lucide-react';

export function PermissionGrant({
  title = 'Filesystem access',
  requester = 'filesystem-mcp',
  grants = [
    'Read and write files under the workspace',
    'Run commands you have already approved',
    'No network access',
  ],
  onDeny,
  onGrantSession,
  onGrantAlways,
  className = '',
  ...props
}) {
  return (
    <div
      data-slot="permission-grant"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-sm flex-col gap-3.5 rounded-[20px] p-4 ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <span className="bg-foreground/[0.05] text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
          <KeyRound className="size-3.5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium text-foreground">
            {title}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            requested by {requester}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
          this grants
        </span>
        {grants.map((grant, idx) => (
          <span
            key={idx}
            className="text-foreground/60 flex items-baseline gap-2 text-xs"
          >
            <span
              aria-hidden="true"
              className="bg-foreground/20 size-1 rounded-full shrink-0 translate-y-[-1px]"
            />
            {grant}
          </span>
        ))}
      </div>

      <div className="flex h-8 items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDeny}
          className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 rounded-full px-3 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={onGrantSession}
          className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground/90 h-8 rounded-full px-3 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.96]"
        >
          This session
        </button>
        <button
          type="button"
          onClick={onGrantAlways}
          className="bg-foreground text-background transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.96] motion-reduce:transition-none forced-colors:border flex h-8 items-center rounded-full px-3 text-xs font-medium"
        >
          Always
        </button>
      </div>
    </div>
  );
}

export default PermissionGrant;
