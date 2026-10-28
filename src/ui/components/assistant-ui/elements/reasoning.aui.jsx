import React, { useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ReasoningRoot({ children, className, streaming = false }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn('my-2 border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/30 text-xs', className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, { isOpen, setIsOpen, streaming });
      })}
    </div>
  );
}

export function ReasoningTrigger({ isOpen, setIsOpen, active = false, streaming = false }) {
  return (
    <button
      type="button"
      onClick={() => setIsOpen?.(!isOpen)}
      className="w-full px-3.5 py-2 flex items-center justify-between text-left text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/30 transition font-mono text-[11px]"
    >
      <span className="flex items-center gap-2">
        <BrainCircuit className="w-3.5 h-3.5 text-zinc-400" />
        <span>Reasoning Process</span>
        {streaming && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
      </span>
      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
    </button>
  );
}

export function ReasoningContent({ children, isOpen }) {
  if (!isOpen) return null;
  return (
    <div className="p-3 border-t border-zinc-800/60 bg-zinc-950/40 font-mono text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
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
