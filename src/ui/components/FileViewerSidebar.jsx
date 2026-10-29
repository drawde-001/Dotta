import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  X,
  Copy,
  Check,
  WrapText,
  MoreVertical
} from 'lucide-react';
import { getFileLanguageMeta, cleanRelativeDisplayPath } from './FileSystemArtifact';

const SAMPLE_MEDIA_PROCESSOR_SNIPPET = `      blob = new Blob([buf], { type: rawMime });
      base64 = buf.toString('base64');
    } else if (audioPayload.blob) {
      blob = audioPayload.blob;
      const arrayBuf = await blob.arrayBuffer();
      base64 = Buffer.from(arrayBuf).toString('base64');
    } else {
      const bytes = new Uint8Array(audioPayload.bytes || []);
      blob = new Blob([bytes], { type: rawMime });
      base64 = Buffer.from(bytes).toString('base64');
    }

    // --- Attempt 1 (DEFAULT PRIMARY): Meta Muse Voice Transcribe (muse-voice-transcribe-1.0) ---`;

export function FileViewerSidebar({ file, onClose }) {
  const [copied, setCopied] = useState(false);
  const [isWrap, setIsWrap] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const filename = file?.name || (file?.path ? file.path.split(/[/\\]/).pop() : 'media-processor.js');
  const actionLabel = file?.actionLabel || (file?.action ? `(${file.action})` : '(single edit)');
  const langMeta = file?.langMeta || getFileLanguageMeta(filename);

  // Compute visual breadcrumb strictly scrubbing root directory
  const rawPath = file?.path || 'src/core/media/media-processor.js';
  const cleanTrail = useMemo(() => {
    const scrubbed = rawPath
      .replace(/\\/g, '/')
      .replace(/^.*?[/\\](?:omni-agent|workspace|project|home\/[^\/]+)[/\\]/i, '')
      .replace(/^[a-zA-Z]:[/\\][^/\\]+[/\\]*/, '')
      .replace(/^([./\\])+/, '');
    const segments = scrubbed.split('/').filter(Boolean);
    // Remove filename from directory segments if present
    if (segments.length > 0 && segments[segments.length - 1] === filename) {
      segments.pop();
    }
    return segments;
  }, [rawPath, filename]);

  // Determine code lines and start line
  const startLine = file?.editStartLine || 326;
  const rawCode = file?.content || file?.newText || SAMPLE_MEDIA_PROCESSOR_SNIPPET;
  const lines = useMemo(() => rawCode.split('\n'), [rawCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightSyntax = (line) => {
    // Basic regex-based syntax tokenization for JS/TS matching Screenshot 2
    if (line.trim().startsWith('//')) {
      return <span className="text-[#6a9955] italic">{line}</span>;
    }

    const tokens = line.split(/(\b(?:const|let|var|new|await|async|else|if|return|function)\b|'[^']*'|"[^"]*"|`[^`]*`|\b(?:blob|buf|base64|arrayBuf|bytes|rawMime|audioPayload)\b)/g);

    return tokens.map((token, i) => {
      if (/^(const|let|var|new|await|async|else|if|return|function)$/.test(token)) {
        return (
          <span key={i} className="text-[#e5c07b] font-medium">
            {token}
          </span>
        );
      }
      if (/^['"`]/.test(token)) {
        return (
          <span key={i} className="text-[#ce9178]">
            {token}
          </span>
        );
      }
      if (/^(blob|buf|base64|arrayBuf|bytes|rawMime|audioPayload)$/.test(token)) {
        return (
          <span key={i} className="text-[#9cdcfe]">
            {token}
          </span>
        );
      }
      return <span key={i} className="text-zinc-200">{token}</span>;
    });
  };

  return (
    <aside
      className={`h-full flex flex-col bg-[#0e110e] border-r border-[#1f261f] text-zinc-200 font-mono transition-all duration-200 z-20 ${
        isMaximized ? 'w-full absolute inset-0 z-50' : 'w-full md:w-[480px] lg:w-[560px] shrink-0'
      }`}
    >
      {/* Top Tab Bar (Matching Screenshot 2 Row 1) */}
      <div className="h-11 px-3 flex items-center justify-between shrink-0 bg-[#0c0e0c] border-b border-[#1c221c] select-none">
        {/* Left: Tab pill, Review button, + button */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a201a] border border-white/10 shadow-sm min-w-0">
            <span className="text-[#eab308] font-bold text-xs tracking-tight">
              {langMeta.badge.toLowerCase()}
            </span>
            <span className="text-xs italic text-zinc-100 font-sans truncate">
              {filename} {actionLabel}
            </span>
          </div>

          <button
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition cursor-pointer"
            title="Review diff"
          >
            <FileText size={13} className="text-zinc-400" />
            <span>Review</span>
          </button>

          <button
            type="button"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition cursor-pointer"
            title="New file tab"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Right: Maximize & Close buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsMaximized((prev) => !prev)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title={isMaximized ? 'Restore size' : 'Expand file viewer'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title="Close file viewer"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      {/* Second Row: Visual Breadcrumb (Matching Screenshot 2 Row 2) */}
      <div className="h-9 px-3 flex items-center justify-between shrink-0 bg-[#0d100d] border-b border-[#182018] text-xs select-none">
        {/* Strictly visual, non-clickable breadcrumb (NO root access/display) */}
        <div className="flex items-center gap-1.5 text-zinc-400 font-sans truncate pointer-events-none select-none">
          {cleanTrail.map((seg, idx) => (
            <React.Fragment key={idx}>
              <span className="text-zinc-400">{seg}</span>
              <span className="text-zinc-600">&gt;</span>
            </React.Fragment>
          ))}
          <span className="text-[#eab308] font-mono font-bold text-[11px]">
            {langMeta.badge.toLowerCase()}
          </span>
          <span className="text-zinc-200 font-medium truncate">
            {filename}
          </span>
          <span className="text-zinc-500 italic shrink-0">
            {actionLabel}
          </span>
        </div>

        {/* Right Actions: More, Copy, Line-wrap */}
        <div className="flex items-center gap-1 shrink-0 select-auto">
          <button
            type="button"
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition"
            title="Options"
          >
            <MoreVertical size={13} />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition"
            title="Copy code"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={() => setIsWrap((prev) => !prev)}
            className={`p-1 rounded transition ${isWrap ? 'text-emerald-400 bg-white/5' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
            title="Toggle line wrapping"
          >
            <WrapText size={13} />
          </button>
        </div>
      </div>

      {/* Code Viewer Area with Olive Green Diff Highlight */}
      <div className="flex-1 overflow-auto bg-[#121811] text-[13px] leading-relaxed p-3">
        <div className="min-w-full inline-block">
          {lines.map((line, idx) => {
            const lineNum = startLine + idx;
            return (
              <div
                key={idx}
                className={`flex items-start group/line px-2 py-0.5 rounded transition-colors bg-[#182618]/70 hover:bg-[#1f331f] ${
                  isWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
                }`}
              >
                {/* Line number in muted green-slate */}
                <span className="w-10 shrink-0 text-right pr-4 text-[#505a4e] select-none text-xs font-mono">
                  {lineNum}
                </span>

                {/* Code content */}
                <div className="flex-1 font-mono text-zinc-200">
                  {highlightSyntax(line)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export default FileViewerSidebar;
