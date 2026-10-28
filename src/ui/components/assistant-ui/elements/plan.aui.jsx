import React from 'react';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle
} from '@/components/ui/trace';
import { Route, CheckCircle2, Circle, Loader2 } from 'lucide-react';

export function AgentPlan({
  title = "Plan",
  steps = [],
  defaultOpen = true,
  className
}) {
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const normalizedSteps = steps.map((s, idx) => {
    if (typeof s === 'string') {
      return { title: s, status: idx === 0 ? 'running' : 'pending' };
    }
    return {
      title: s.title || s.step || `Step ${idx + 1}`,
      status: s.status || 'pending'
    };
  });

  const doneCount = normalizedSteps.filter((s) => s.status === 'done').length;
  const runningStep = normalizedSteps.find((s) => s.status === 'running');
  const overallStatus = runningStep ? 'running' : doneCount === normalizedSteps.length ? 'done' : 'default';

  return (
    <div className={`my-2.5 rounded-xl border border-white/[0.08] bg-[#121215]/80 p-1.5 shadow-sm ${className || ''}`}>
      <Trace>
        <TraceCollapsible defaultOpen={defaultOpen}>
          <TraceCollapsibleTrigger>
            <TraceLine status={overallStatus}>
              <TraceIcon>
                <Route className="w-3.5 h-3.5 text-sky-400" />
              </TraceIcon>
              <TraceTitle>{title}</TraceTitle>
              <TraceDescription>
                {doneCount} of {normalizedSteps.length} done
              </TraceDescription>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              {normalizedSteps.map((step, idx) => (
                <TraceLine key={idx} status={step.status}>
                  <TraceIcon>
                    {step.status === 'done' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : step.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-zinc-600" />
                    )}
                  </TraceIcon>
                  <TraceTitle className={step.status === 'done' ? 'line-through text-zinc-500' : ''}>
                    {step.title}
                  </TraceTitle>
                </TraceLine>
              ))}
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  );
}

export { AgentPlan as Plan };
