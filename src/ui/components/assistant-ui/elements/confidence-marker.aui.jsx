import React, { useState } from 'react';

const DEFAULT_SEGMENTS = [
  {
    text: 'The composer owns its draft from 0.14 onward. ',
    level: 'high',
    score: 0.96,
  },
  {
    text: 'Most apps will not need the hydrate effect anymore. ',
    level: 'medium',
    score: 0.74,
  },
  {
    text: 'Removing it should cut a render on every thread switch. ',
    level: 'low',
    score: 0.42,
  },
];

export function ConfidenceMarker({
  segments = DEFAULT_SEGMENTS,
  className = '',
  ...props
}) {
  const [activeSegment, setActiveSegment] = useState(null);

  const getDecorationClass = (level) => {
    switch (level) {
      case 'high':
        return 'decoration-emerald-500/50';
      case 'medium':
        return 'decoration-amber-500/60';
      case 'low':
        return 'decoration-red-500/50 decoration-dotted';
      default:
        return 'decoration-foreground/20';
    }
  };

  return (
    <div
      data-slot="confidence-marker"
      className={`flex w-full max-w-sm flex-col gap-2.5 ${className}`}
      {...props}
    >
      <p className="text-[13.5px] leading-relaxed">
        {segments.map((seg, idx) => (
          <button
            key={idx}
            type="button"
            onMouseEnter={() => setActiveSegment(seg)}
            onMouseLeave={() => setActiveSegment(null)}
            className={`focus-visible:ring-foreground/20 inline cursor-help rounded text-start underline decoration-2 underline-offset-[3px] transition-colors outline-none focus-visible:ring-1 text-foreground/70 ${getDecorationClass(
              seg.level
            )}`}
          >
            {seg.text}
          </button>
        ))}
      </p>

      <div className="flex h-9 items-start">
        {activeSegment && (
          <span className="font-mono text-[11px] tracking-tight text-muted-foreground fade-in animate-in duration-150">
            {activeSegment.level} confidence ({Math.round(activeSegment.score * 100)}%)
          </span>
        )}
      </div>
    </div>
  );
}

export default ConfidenceMarker;
