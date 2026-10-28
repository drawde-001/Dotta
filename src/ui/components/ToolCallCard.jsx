import React, { useState } from 'react';
import { Globe, FileText, Terminal, Check, AlertCircle, ChevronRight, Loader2, Sparkles } from 'lucide-react';

export function ToolCallCard({ name, args = {}, output, status = 'running' }) {
  const [isOpen, setIsOpen] = useState(false);

  const getToolMeta = () => {
    switch (name) {
      case 'browser_search':
      case 'web_search':
        return {
          icon: <Globe className="w-3.5 h-3.5 text-sky-400" />,
          label: args.query ? `Search: "${args.query}"` : 'Web Search'
        };
      case 'browser_read_page':
      case 'read_page':
        return {
          icon: <Globe className="w-3.5 h-3.5 text-blue-400" />,
          label: args.url ? `Read: ${args.url}` : 'Read Webpage'
        };
      case 'file_read':
      case 'file_write':
      case 'file_edit':
      case 'file_list':
      case 'file_search':
      case 'workspace_create':
        return {
          icon: <FileText className="w-3.5 h-3.5 text-amber-400" />,
          label: `${name} ${args.path || args.name || ''}`.trim()
        };
      case 'shell_run':
        return {
          icon: <Terminal className="w-3.5 h-3.5 text-emerald-400" />,
          label: args.command ? `$ ${args.command}` : 'Shell Command'
        };
      default:
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-indigo-400" />,
          label: name
        };
    }
  };

  const { icon, label } = getToolMeta();
  const isRunning = status === 'running';
  const isError = status === 'error' || status === 'permanent_error';

  return (
    <div className="my-2 border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/40 text-xs transition-colors">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition gap-2"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <span className="font-mono text-xs text-zinc-300 truncate">{label}</span>
          {args.stepTitle && (
            <span className="text-[11px] text-zinc-500 truncate hidden sm:inline">
              · {args.stepTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-sans">
              <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              Running
            </span>
          ) : isError ? (
            <span className="flex items-center gap-1 text-[11px] text-red-400 font-sans">
              <AlertCircle className="w-3 h-3 text-red-400" />
              Failed
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-zinc-400 font-sans">
              <Check className="w-3 h-3 text-emerald-400" />
              Done
            </span>
          )}
          <ChevronRight
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-150 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="p-3 border-t border-zinc-800/60 bg-zinc-950/60 space-y-2.5 font-mono text-[11px]">
          {args && Object.keys(args).length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-500 font-sans mb-1">
                Arguments
              </div>
              <pre className="p-2.5 rounded-lg bg-zinc-900/80 text-zinc-300 overflow-x-auto border border-zinc-800/40">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {output && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-500 font-sans mb-1">
                Output
              </div>
              <pre className="p-2.5 rounded-lg bg-zinc-900/80 text-zinc-300 overflow-x-auto max-h-56 whitespace-pre-wrap border border-zinc-800/40">
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
