import React, { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  WrapText
} from 'lucide-react';
import { getFileLanguageMeta } from './FileSystemArtifact';

export function ReactIcon({ className = "size-3.5 text-cyan-400" }) {
  return (
    <svg className={className} viewBox="-11.5 -10.23174 23 20.46348" fill="currentColor">
      <circle cx="0" cy="0" r="2.05" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  );
}

export function getFileIcon(filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return <ReactIcon className="size-3.5 text-cyan-400 shrink-0" />;
    case 'ts':
      return <span className="font-mono text-[10px] font-bold text-sky-400 shrink-0">TS</span>;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <span className="font-mono text-[10px] font-bold text-amber-400 shrink-0">JS</span>;
    case 'json':
      return <span className="font-mono text-[10px] font-bold text-yellow-300 shrink-0">&#123; &#125;</span>;
    case 'html':
      return <span className="font-mono text-[10px] font-bold text-orange-400 shrink-0">HTML</span>;
    case 'css':
      return <span className="font-mono text-[10px] font-bold text-blue-400 shrink-0">CSS</span>;
    default:
      return <span className="font-mono text-[10px] font-bold text-zinc-400 shrink-0">&lt;/&gt;</span>;
  }
}

export function FileCodeViewer({ file }) {
  const [copied, setCopied] = useState(false);
  const [isWrap, setIsWrap] = useState(false);

  const filename = file?.name || (file?.path ? file.path.split(/[/\\]/).pop() : 'untitled');
  const langMeta = file?.langMeta || getFileLanguageMeta(filename);

  const rawCode = file?.content || file?.newText || '';
  const lines = useMemo(() => {
    if (!rawCode) return ['// Empty file or no content loaded'];
    return rawCode.split('\n');
  }, [rawCode]);

  const startLine = file?.editStartLine || 1;

  const handleCopy = () => {
    navigator.clipboard.writeText(rawCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightSyntax = (line) => {
    if (line.trim().startsWith('//')) {
      return <span className="text-[#6a9955] italic">{line}</span>;
    }

    const tokens = line.split(/(\b(?:const|let|var|new|await|async|else|if|return|function|import|export|from|default|class|interface|type)\b|'[^']*'|"[^"]*"|`[^`]*`|\b(?:props|state|className|children|id|title|steps|label|style|value|true|false|null|undefined)\b)/g);

    return tokens.map((token, i) => {
      if (/^(const|let|var|new|await|async|else|if|return|function|import|export|from|default|class|interface|type)$/.test(token)) {
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
      if (/^(props|state|className|children|id|title|steps|label|style|value|true|false|null|undefined)$/.test(token)) {
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
    <div className="h-full flex flex-col bg-[#0b0e0b] text-zinc-200 font-mono overflow-hidden">
      {/* File header row: filename only (directory paths are never displayed) */}
      <div className="h-9 px-3 flex items-center justify-between shrink-0 bg-[#0d100d] border-b border-[#182018] text-xs select-none">
        <div className="flex items-center gap-1.5 text-zinc-400 font-sans truncate pointer-events-none select-none">
          {getFileIcon(filename)}
          <span className="text-zinc-200 font-medium truncate">
            {filename}
          </span>
        </div>

        {/* Right Actions: Copy & Line-wrap (Cleaned up, no MoreVertical) */}
        <div className="flex items-center gap-1 shrink-0 select-auto">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title="Copy code"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={() => setIsWrap((prev) => !prev)}
            className={`p-1 rounded transition cursor-pointer ${isWrap ? 'text-emerald-400 bg-white/5' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
            title="Toggle line wrapping"
          >
            <WrapText size={13} />
          </button>
        </div>
      </div>

      {/* Code Viewer Area - Clean background, NO artificial diff green background on every line */}
      <div className="flex-1 overflow-auto bg-[#0b0e0b] text-[13px] leading-relaxed p-2 font-mono">
        <div className="min-w-full inline-block">
          {lines.map((line, idx) => {
            const lineNum = startLine + idx;
            return (
              <div
                key={idx}
                className={`flex items-start group/line px-2 py-0.5 rounded transition-colors hover:bg-white/[0.04] ${
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
    </div>
  );
}

export default FileCodeViewer;
