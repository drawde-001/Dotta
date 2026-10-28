import React from 'react';
import { cn } from '@/lib/utils';

export const Button = React.forwardRef(({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  style,
  ...props
}, ref) => {
  const baseClasses = 'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50';

  const variantClasses = {
    default: 'bg-zinc-100 text-zinc-900 shadow hover:bg-zinc-200 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200',
    outline: 'border border-zinc-800 bg-transparent shadow-sm hover:bg-zinc-800 hover:text-zinc-100',
    ghost: 'hover:bg-zinc-800 hover:text-zinc-100 text-zinc-400',
    destructive: 'bg-red-500 text-zinc-50 shadow-sm hover:bg-red-500/90'
  };

  const sizeClasses = {
    default: 'h-9 px-4 py-2 text-sm',
    sm: 'h-8 rounded-md px-3 text-xs',
    lg: 'h-10 rounded-md px-8 text-sm',
    icon: 'h-7 w-7 rounded-full p-0'
  };

  return (
    <button
      ref={ref}
      className={cn(baseClasses, variantClasses[variant] || variantClasses.default, sizeClasses[size] || sizeClasses.default, className)}
      style={style}
      {...props}
    />
  );
});

Button.displayName = 'Button';
