import React, { useState } from 'react';
import { Terminal, FileText, Globe, CheckCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

export function ToolCallCard({ name, args, output, status }) {
  const [isOpen, setIsOpen] = useState(false);

  const getIcon = () => {
    if (name.startsWith('browser_')) return <Globe className="w-4 h-4 text-blue-500" />;
    if (name.startsWith('file_') || name.startsWith('workspace_')) return <FileText className="w-4 h-4 text-amber-500" />;
    if (name.startsWith('shell_')) return <Terminal className="w-4 h-4 text-emerald-500" />;
    return <Terminal className="w-4 h-4 text-purple-500" />;
  };

  return (
    <div className="my-2 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-900 text-xs font-mono">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
      >
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{name}</span>
          {args?.stepTitle && <span className="text-zinc-500 truncate max-w-xs font-sans">({args.stepTitle})</span>}
        </div>
        <div className="flex items-center gap-2">
          {status === 'ok' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
          {status === 'permanent_error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
          {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2 bg-white dark:bg-zinc-950">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-1">Arguments</div>
            <pre className="p-2 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 overflow-x-auto text-[11px]">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {output && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-1">Result</div>
              <pre className="p-2 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 overflow-x-auto text-[11px] max-h-48 whitespace-pre-wrap">
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
