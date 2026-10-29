import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ThinkingIndicator } from './thinking-indicator.aui.jsx';
import { cn } from '@/lib/utils';

export function ReasoningRoot({ children, className, streaming = false }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn('my-2 border border-border/60 rounded-xl overflow-hidden bg-background/50 dark:bg-card/40 text-xs', className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, { isOpen, setIsOpen, streaming });
      })}
    </div>
  );
}

export function ReasoningTrigger({ isOpen, setIsOpen, active = false, streaming = false }) {
  if (streaming && !isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen?.(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-left cursor-pointer transition hover:bg-foreground/[0.03]"
      >
        <ThinkingIndicator label="Reasoning" />
        <ChevronRight className="size-3.5 opacity-50 text-muted-foreground" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsOpen?.(!isOpen)}
      className="w-full px-3 py-2 flex items-center justify-between text-left text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition text-[12.5px] cursor-pointer"
    >
      <span className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-blue-500/80" />
        <span className="font-medium">Reasoning process</span>
      </span>
      {isOpen ? <ChevronDown className="size-3.5 opacity-60" /> : <ChevronRight className="size-3.5 opacity-60" />}
    </button>
  );
}

export function ReasoningContent({ children, isOpen }) {
  if (!isOpen) return null;
  return (
    <div className="p-3 border-t border-border/50 bg-foreground/[0.02] font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
      {children}
    </div>
  );
}

export function ReasoningText({ children }) {
  return <span>{children}</span>;
}

export function Reasoning({ text = '', details = '' }) {
  const content = text || details;
  if (!content) return null;

  return (
    <ReasoningRoot>
      <ReasoningTrigger />
      <ReasoningContent>
        <ReasoningText>{content}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
}

export default Reasoning;
