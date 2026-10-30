import React, { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  WrapText
} from 'lucide-react';
import { getFileLanguageMeta } from './FileSystemArtifact';
import { getFileIcon } from './FileBrowser';

export function FileCodeViewer({ file }) {
  const [copied, setCopied] = useState(false);
  const [isWrap, setIsWrap] = useState(false);

  const filename = file?.name || (file?.path ? file.path.split(/[/\\]/).pop() : 'untitled');
  const langMeta = file?.langMeta || getFileLanguageMeta(filename);

  // Compute visual breadcrumb strictly matching Screenshot 2 (e.g. agent > src > ui > components > ...)
  const rawPath = file?.path || filename;
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
    // Prefix with agent if not root
    return ['agent', ...segments];
  }, [rawPath, filename]);

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
      {/* Visual Breadcrumb Row (Matching Screenshot 2 Row 2 exactly) */}
      <div className="h-9 px-3 flex items-center justify-between shrink-0 bg-[#0d100d] border-b border-[#182018] text-xs select-none">
        {/* Strictly visual breadcrumb: agent > src > ui > ... > [icon] filename */}
        <div className="flex items-center gap-1.5 text-zinc-400 font-sans truncate pointer-events-none select-none">
          {cleanTrail.map((seg, idx) => (
            <React.Fragment key={idx}>
              <span className="text-zinc-400">{seg}</span>
              <span className="text-zinc-600">&gt;</span>
            </React.Fragment>
          ))}
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
