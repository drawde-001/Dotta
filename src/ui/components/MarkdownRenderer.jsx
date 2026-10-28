import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function MarkdownRenderer({ content = '' }) {
  if (!content) return null;

  // Split text by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-zinc-200">
      {parts.map((part, pIdx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trim().split('\n');
          const firstLine = lines[0].trim();
          const isLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
          const lang = isLang ? firstLine : '';
          const code = isLang ? lines.slice(1).join('\n') : lines.join('\n');

          return <CodeBlock key={pIdx} code={code} lang={lang} />;
        }

        // Render regular markdown paragraphs, lists, and headers
        const paragraphs = part.split(/\n\n+/);
        return (
          <React.Fragment key={pIdx}>
            {paragraphs.map((para, paraIdx) => {
              const trimmed = para.trim();
              if (!trimmed) return null;

              // Check if blockquote
              if (trimmed.startsWith('>')) {
                const quoteLines = trimmed.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ');
                return (
                  <blockquote
                    key={paraIdx}
                    className="border-l-2 border-zinc-600 pl-3.5 my-2 text-zinc-400 italic text-[13.5px]"
                  >
                    {renderInline(quoteLines)}
                  </blockquote>
                );
              }

              // Check if table
              if (trimmed.includes('|') && trimmed.split('\n').length >= 2) {
                const lines = trimmed.split('\n').filter((l) => l.trim().startsWith('|'));
                if (lines.length >= 2) {
                  const headers = lines[0]
                    .split('|')
                    .map((h) => h.trim())
                    .filter((h) => h.length > 0);
                  const isSeparator = /^\|?[\s-:]+\|?/.test(lines[1]);
                  const rowStart = isSeparator ? 2 : 1;
                  const rows = lines.slice(rowStart).map((l) =>
                    l
                      .split('|')
                      .map((c) => c.trim())
                      .filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''))
                  );

                  return (
                    <div key={paraIdx} className="my-3 overflow-x-auto rounded-lg border border-zinc-800">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-300 font-medium">
                          <tr>
                            {headers.map((h, hIdx) => (
                              <th key={hIdx} className="px-3 py-2">
                                {renderInline(h)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40">
                          {rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-zinc-900/30">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-3 py-2 text-zinc-300">
                                  {renderInline(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
              }

              const lines = trimmed.split('\n');

              // Check if bullet list
              const isList = lines.every((l) => /^\s*[-*•]\s+/.test(l) || /^\s*\d+\.\s+/.test(l) || l.trim() === '');
              if (isList && lines.some((l) => l.trim() !== '')) {
                return (
                  <ul key={paraIdx} className="space-y-1.5 pl-4 list-disc marker:text-zinc-500">
                    {lines
                      .filter((l) => l.trim() !== '')
                      .map((l, lIdx) => {
                        const itemText = l.replace(/^\s*[-*•]\s+/, '').replace(/^\s*\d+\.\s+/, '');
                        return <li key={lIdx}>{renderInline(itemText)}</li>;
                      })}
                  </ul>
                );
              }

              // Check headers
              if (trimmed.startsWith('### ')) {
                return (
                  <h3 key={paraIdx} className="text-[15px] font-semibold text-zinc-100 mt-4 mb-1.5 tracking-tight">
                    {renderInline(trimmed.slice(4))}
                  </h3>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h2 key={paraIdx} className="text-base font-semibold text-zinc-100 mt-5 mb-2 tracking-tight">
                    {renderInline(trimmed.slice(3))}
                  </h2>
                );
              }
              if (trimmed.startsWith('# ')) {
                return (
                  <h1 key={paraIdx} className="text-lg font-bold text-zinc-100 mt-6 mb-2.5 tracking-tight">
                    {renderInline(trimmed.slice(2))}
                  </h1>
                );
              }

              return (
                <p key={paraIdx} className="whitespace-pre-wrap leading-relaxed text-[13.5px]">
                  {renderInline(trimmed)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-zinc-800 bg-[#121215] font-mono text-xs shadow-md">
      <div className="px-3.5 py-2 bg-zinc-900/70 border-b border-zinc-800/80 flex items-center justify-between text-zinc-400 text-[11px] font-sans">
        <span className="font-mono text-zinc-400 font-medium">{lang || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition px-2 py-0.5 rounded hover:bg-zinc-800 cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-[11px] text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-zinc-300 leading-relaxed font-mono text-[12.5px] select-text">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text) {
  // Regex to match inline links [text](url), bold **text**, and inline code `code`
  const regex = /(\[.*?\]\(.*?\)|\*\*.*?\*\*|`.*?`)/g;
  const segments = text.split(regex);

  return segments.map((seg, sIdx) => {
    if (seg.startsWith('[') && seg.includes('](') && seg.endsWith(')')) {
      const match = seg.match(/^\[(.*?)\]\((.*?)\)$/);
      if (match) {
        return (
          <a
            key={sIdx}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 underline underline-offset-2 font-medium transition-colors"
          >
            {match[1]}
          </a>
        );
      }
    }
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length >= 4) {
      return (
        <strong key={sIdx} className="font-semibold text-zinc-100">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    if (seg.startsWith('`') && seg.endsWith('`') && seg.length >= 2) {
      return (
        <code key={sIdx} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-[12px] border border-zinc-700/50">
          {seg.slice(1, -1)}
        </code>
      );
    }
    return seg;
  });
}
