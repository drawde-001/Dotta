import React, { useEffect, useState } from 'react';

// 3x3 matrix pattern permutations matching assistant-ui generation loader
const PATTERNS = [
  [0.9, 0.9, 0.15, 0.15, 0.15, 0.9, 0.15, 0.15, 0.15],
  [0.15, 0.9, 0.9, 0.15, 0.15, 0.15, 0.9, 0.15, 0.15],
  [0.15, 0.15, 0.9, 0.9, 0.15, 0.15, 0.15, 0.9, 0.15],
  [0.15, 0.15, 0.15, 0.9, 0.9, 0.15, 0.15, 0.15, 0.9],
  [0.9, 0.15, 0.15, 0.15, 0.9, 0.9, 0.15, 0.15, 0.15],
  [0.15, 0.9, 0.15, 0.15, 0.15, 0.9, 0.9, 0.15, 0.15],
];

export function LoadingState({
  label = 'Generating',
  className = '',
  ...props
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % PATTERNS.length);
    }, 280);
    return () => clearInterval(timer);
  }, []);

  const opacities = PATTERNS[step];

  return (
    <div
      data-slot="generation-loader"
      className={`flex flex-col items-center gap-4 ${className}`}
      {...props}
    >
      <div aria-hidden="true" class="grid grid-cols-3 gap-1">
        {opacities.map((op, idx) => (
          <span
            key={idx}
            className="bg-foreground size-2 transition-opacity duration-300 motion-reduce:transition-none rounded-full"
            style={{ opacity: op }}
          />
        ))}
      </div>
      <span className="shimmer motion-reduce:animate-none text-muted-foreground relative inline-block text-sm">
        {label}
      </span>
    </div>
  );
}

export default LoadingState;
