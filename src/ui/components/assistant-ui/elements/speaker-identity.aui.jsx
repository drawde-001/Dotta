import React from 'react';
import { User, Bot, Wrench } from 'lucide-react';

export function SpeakerIdentity({
  role = 'assistant', // 'user' | 'assistant' | 'subagent' | 'tool'
  name = 'Maintainer',
  model = 'opus',
  message = 'Splitting this: one worker reads the converter, one reads the tests.',
  className = '',
  ...props
}) {
  const renderIcon = () => {
    switch (role) {
      case 'user':
        return (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
            <User className="size-3" aria-hidden="true" />
          </span>
        );
      case 'assistant':
        return (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/12 text-blue-600 dark:bg-blue-400/15 dark:text-blue-400">
            <Bot className="size-3" aria-hidden="true" />
          </span>
        );
      case 'subagent':
        return (
          <span className="flex size-6 shrink-0 items-center justify-center bg-foreground/[0.06] text-muted-foreground rounded-full">
            <Bot className="size-3" aria-hidden="true" />
          </span>
        );
      case 'tool':
      default:
        return (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] text-muted-foreground">
            <Wrench className="size-3" aria-hidden="true" />
          </span>
        );
    }
  };

  return (
    <div
      data-slot="speaker-identity"
      className={`flex gap-2.5 ${className}`}
      {...props}
    >
      {renderIcon()}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-medium text-foreground">{name}</span>
          {model && (
            <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
              {model}
            </span>
          )}
        </span>
        <span className="text-foreground/65 text-[13.5px] leading-relaxed break-words">
          {message}
        </span>
      </div>
    </div>
  );
}

export default SpeakerIdentity;
