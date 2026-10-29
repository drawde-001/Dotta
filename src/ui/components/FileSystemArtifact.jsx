import React from 'react';
import { File } from '@/components/assistant-ui/elements/file';

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

export function getFileMimeType(filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'json':
      return 'application/json';
    case 'pdf':
      return 'application/pdf';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    case 'mp3':
    case 'wav':
      return `audio/${ext}`;
    case 'mp4':
    case 'webm':
      return `video/${ext}`;
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'html':
    case 'css':
    case 'py':
    case 'md':
    case 'sh':
    case 'txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Clickable file entry in chat, rendered with the gathered assistant-ui `File` element
 * (File.Root / File.Icon / File.Name). Clicking opens the Left Sidebar File Viewer.
 * The path line is display-only (never clickable / selectable).
 */
export function FileSystemArtifact({ artifact, onClick }) {
  const filename = artifact?.name || (artifact?.path ? artifact.path.split(/[/\\]/).pop() : 'file');
  const action = artifact?.action || (artifact?.editStartLine ? 'single edit' : artifact?.newText ? 'created' : 'viewed');
  const actionLabel = `(${action})`;
  const displayBreadcrumb = cleanRelativeDisplayPath(artifact?.path || '');
  const langMeta = getFileLanguageMeta(filename);

  const handleOpen = (e) => {
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
    <File.Root
      role="button"
      tabIndex={0}
      title="Click to view file in left sidebar"
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen(e);
        }
      }}
      className="cursor-pointer max-w-full select-none"
    >
      <File.Icon mimeType={getFileMimeType(filename)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <File.Name>
          {filename} <span className="text-muted-foreground font-normal italic">{actionLabel}</span>
        </File.Name>
        {displayBreadcrumb && (
          <span className="text-muted-foreground pointer-events-none truncate text-xs select-none">
            {displayBreadcrumb}
          </span>
        )}
      </div>
    </File.Root>
  );
}

export default FileSystemArtifact;
