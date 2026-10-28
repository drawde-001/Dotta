import React from 'react';
import { Globe } from 'lucide-react';

export function Sources({ url, title, name }) {
  const displayTitle = title || name || url;
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:border-zinc-700 transition"
    >
      <Globe className="w-3 h-3 text-sky-400" />
      <span className="truncate max-w-[200px]">{displayTitle}</span>
    </a>
  );
}
