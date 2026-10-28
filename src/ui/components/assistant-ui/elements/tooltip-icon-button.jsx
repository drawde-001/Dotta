import React from 'react';
import { cn } from '@/lib/utils';

export const TooltipIconButton = React.forwardRef(({
  tooltip,
  side = 'bottom',
  variant = 'ghost',
  size = 'icon',
  className,
  children,
  style,
  ...props
}, ref) => {
  return (
    <button
      ref={ref}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors focus:outline-none disabled:opacity-40 disabled:pointer-events-none',
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
});

TooltipIconButton.displayName = 'TooltipIconButton';
