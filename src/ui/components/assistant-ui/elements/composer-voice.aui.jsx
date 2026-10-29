import React from 'react';
import { ShimmerLabel } from './surfaces';

const BARS = Array.from({ length: 14 }, (_, i) => i);

function barHeight(bar, tick) {
  return 5 + Math.abs(Math.sin(bar * 1.35 + tick * 0.55)) * 13;
}

export function ComposerVoiceDictation({
  isRecording = false,
  isTranscribing = false,
  recordingSeconds = 0,
  recordingTime = '0:00',
}) {
  if (!isRecording && !isTranscribing) return null;

  return (
    <div
      data-slot="composer-voice"
      data-recording={isRecording || undefined}
      className="flex min-h-9 items-center gap-3 px-1 py-1 mb-2 select-none"
    >
      {isRecording && (
        <span
          aria-hidden="true"
          className="size-1.5 animate-pulse rounded-full bg-red-500 dark:bg-red-400"
        />
      )}
      <div className="flex h-6 items-center gap-[3px]" aria-hidden="true">
        {BARS.map((bar) => (
          <span
            key={bar}
            className={`w-0.5 rounded-full transition-[height,background-color] duration-150 motion-reduce:transition-none ${
              isRecording ? 'bg-foreground/50' : 'bg-foreground/25'
            }`}
            style={{
              height: isRecording ? `${barHeight(bar, (recordingSeconds || 1) * 10)}px` : '3px'
            }}
          />
        ))}
      </div>
      {isRecording ? (
        <span className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground tabular-nums">
          {recordingTime}
        </span>
      ) : (
        <ShimmerLabel className="text-muted-foreground relative text-[13px]">
          Transcribing
        </ShimmerLabel>
      )}
    </div>
  );
}
