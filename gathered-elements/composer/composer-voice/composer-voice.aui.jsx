import React from 'react';
import { Square, X, Loader2, Sparkles } from 'lucide-react';

export function ComposerVoiceDictation({
  isRecording = false,
  isTranscribing = false,
  recordingTime = '0:00',
  transcribingStatus = 'Transcribing audio...',
  onStop,
  onCancel
}) {
  if (!isRecording && !isTranscribing) return null;

  return (
    <div
      data-slot="composer-voice"
      className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[16px] bg-zinc-900/90 dark:bg-zinc-900/95 border border-zinc-700/60 dark:border-white/15 backdrop-blur-md shadow-lg animate-in fade-in duration-200 select-none mb-2"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Status Indicator / Pulse */}
        {isRecording ? (
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2.5 bg-red-500" />
            </span>
            <span className="text-xs font-semibold tracking-wide text-red-400 uppercase">
              Rec
            </span>
            <span className="text-xs font-mono font-medium text-zinc-200">
              {recordingTime}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-indigo-400">
            <Loader2 className="size-3.5 animate-spin text-indigo-400" />
            <span className="text-xs font-medium text-zinc-200">
              {transcribingStatus}
            </span>
          </div>
        )}

        {/* Live Morphing Waveform Bars */}
        <div className="flex items-center gap-1 h-5 px-1.5 overflow-hidden">
          {[40, 75, 55, 90, 65, 85, 45, 95, 70, 50, 80, 60].map((h, i) => (
            <span
              key={i}
              className={`w-0.5 rounded-full transition-all duration-300 ${
                isRecording
                  ? 'bg-red-400/90 dark:bg-red-400'
                  : 'bg-indigo-400/90 dark:bg-indigo-400'
              }`}
              style={{
                height: isRecording
                  ? `${Math.max(20, (h * ((i % 3) + 1)) % 100)}%`
                  : `${Math.max(25, (h * ((i % 2) + 1)) % 90)}%`,
                animation: isRecording
                  ? `pulse 0.8s ease-in-out infinite alternate ${i * 0.08}s`
                  : `pulse 1.2s ease-in-out infinite alternate ${i * 0.1}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isRecording && onStop && (
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 text-xs font-medium transition-colors"
            title="Stop recording and transcribe"
          >
            <Square className="size-2.5 fill-current" />
            <span>Done</span>
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel voice input"
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors"
            title="Cancel"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
