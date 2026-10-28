import React from 'react';

/**
 * Lightweight, zero-dependency Markdown renderer for Assistant UI
 * Handles headings, bold, italics, inline code, code blocks, bullet lists, and clickable links.
 */
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

          return (
            <div key={pIdx} className="my-3 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900/80 font-mono text-xs">
              {lang && (
                <div className="px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800 text-zinc-400 text-[11px] font-sans">
                  {lang}
                </div>
              )}
              <pre className="p-3 overflow-x-auto text-zinc-300">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        // Render regular markdown paragraphs, lists, and headers
        const paragraphs = part.split(/\n\n+/);
        return (
          <React.Fragment key={pIdx}>
            {paragraphs.map((para, paraIdx) => {
              const lines = para.split('\n');

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

              // Check header
              if (para.startsWith('### ')) {
                return <h3 key={paraIdx} className="text-base font-semibold text-zinc-100 mt-4 mb-2">{renderInline(para.slice(4))}</h3>;
              }
              if (para.startsWith('## ')) {
                return <h2 key={paraIdx} className="text-lg font-bold text-zinc-100 mt-5 mb-2">{renderInline(para.slice(3))}</h2>;
              }
              if (para.startsWith('# ')) {
                return <h1 key={paraIdx} className="text-xl font-bold text-zinc-100 mt-6 mb-3">{renderInline(para.slice(2))}</h1>;
              }

              return (
                <p key={paraIdx} className="whitespace-pre-wrap">
                  {renderInline(para)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
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
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 font-medium"
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
        <code key={sIdx} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[13px]">
          {seg.slice(1, -1)}
        </code>
      );
    }
    return seg;
  });
}
