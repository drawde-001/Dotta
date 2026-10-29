import React from 'react';
import { ChevronRight, FileCode, ExternalLink } from 'lucide-react';

export function getFileLanguageMeta(filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return { lang: 'js', badge: 'JS', color: 'text-amber-400 bg-amber-400/10 border-amber-400/25' };
    case 'jsx':
      return { lang: 'jsx', badge: 'JSX', color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/25' };
    case 'ts':
      return { lang: 'ts', badge: 'TS', color: 'text-sky-400 bg-sky-400/10 border-sky-400/25' };
    case 'tsx':
      return { lang: 'tsx', badge: 'TSX', color: 'text-blue-400 bg-blue-400/10 border-blue-400/25' };
    case 'json':
      return { lang: 'json', badge: '{ }', color: 'text-yellow-300 bg-yellow-300/10 border-yellow-300/25' };
    case 'html':
      return { lang: 'html', badge: 'HTML', color: 'text-orange-400 bg-orange-400/10 border-orange-400/25' };
    case 'css':
      return { lang: 'css', badge: 'CSS', color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/25' };
    case 'py':
      return { lang: 'python', badge: 'PY', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25' };
    case 'md':
      return { lang: 'markdown', badge: 'MD', color: 'text-zinc-300 bg-zinc-300/10 border-zinc-300/25' };
    case 'sh':
    case 'bash':
      return { lang: 'bash', badge: 'SH', color: 'text-lime-400 bg-lime-400/10 border-lime-400/25' };
    default:
      return { lang: 'text', badge: 'FILE', color: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/25' };
  }
}

export function cleanRelativeDisplayPath(rawPath = '') {
  if (!rawPath || typeof rawPath !== 'string') return '';
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^.*?[/\\](?:omni-agent|workspace|project|home\/[^\/]+)[/\\]/i, '')
    .replace(/^[a-zA-Z]:[/\\][^/\\]+[/\\]*/, '')
    .replace(/^([./\\])+/, '')
    .replace(/\/+/g, ' > ');
}

export function openFileInViewer(fileData) {
  if (!fileData) return;
  window.dispatchEvent(new CustomEvent('omni:open-file', { detail: fileData }));
}

/**
 * Clickable File System Component in Chat
 * Clicking opens the Left Sidebar File Viewer matching Screenshot 2.
 */
export function FileSystemArtifact({ artifact, onClick }) {
  const filename = artifact?.name || (artifact?.path ? artifact.path.split(/[/\\]/).pop() : 'file');
  const action = artifact?.action || (artifact?.editStartLine ? 'single edit' : artifact?.newText ? 'created' : 'viewed');
  const actionLabel = `(${action})`;
  const displayBreadcrumb = cleanRelativeDisplayPath(artifact?.path || '');
  const langMeta = getFileLanguageMeta(filename);

  const handleClick = (e) => {
    e.stopPropagation();
    const payload = {
      ...artifact,
      name: filename,
      action,
      actionLabel,
      breadcrumb: displayBreadcrumb,
      langMeta
    };
    if (onClick) {
      onClick(payload);
    } else {
      openFileInViewer(payload);
    }
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title="Click to view file in left sidebar"
      className="group relative my-2 flex items-center justify-between rounded-xl border border-zinc-800/90 bg-[#121316] px-3.5 py-2.5 transition-all duration-150 hover:border-zinc-700 hover:bg-[#18191d] cursor-pointer shadow-sm select-none"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-bold border ${langMeta.color}`}
        >
          {langMeta.badge}
        </span>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-[13.5px] font-medium text-zinc-100 group-hover:text-white">
              {filename}
            </span>
            <span className="shrink-0 text-xs italic text-zinc-400">
              {actionLabel}
            </span>
          </div>

          {displayBreadcrumb && (
            <span className="truncate text-[11px] text-zinc-500 font-mono pointer-events-none select-none">
              {displayBreadcrumb}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 text-zinc-500 group-hover:text-zinc-300 transition-colors ps-2">
        <span className="text-[11px] font-medium hidden sm:inline-block">View</span>
        <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </div>
    </div>
  );
}

export default FileSystemArtifact;
