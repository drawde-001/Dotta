import React from 'react';
import {
  Paperclip,
  FileImage,
  FileAudio,
  FileVideo,
  FileArchive,
  FileText,
  File,
  Loader2,
  Check,
  X
} from 'lucide-react';
import { TooltipIconButton } from './tooltip-icon-button';

export function formatFileSize(bytes) {
  if (
    typeof bytes === 'string' &&
    (bytes.endsWith('B') || bytes.endsWith('KB') || bytes.endsWith('MB') || bytes.endsWith('GB'))
  ) {
    return bytes;
  }
  const num = Number(bytes) || 0;
  if (num <= 0) return '0 B';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileCategoryIcon(mimeType = '', filename = '') {
  const type = (mimeType || '').toLowerCase();
  const ext = (filename.split('.').pop() || '').toLowerCase();

  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'bmp'].includes(ext)) {
    return <FileImage className="lucide lucide-file-image size-4" aria-hidden="true" />;
  }
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) {
    return <FileAudio className="lucide lucide-file-audio size-4" aria-hidden="true" />;
  }
  if (type.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    return <FileVideo className="lucide lucide-file-video size-4" aria-hidden="true" />;
  }
  if (['zip', 'tar', 'gz', 'tgz', 'rar', '7z'].includes(ext)) {
    return <FileArchive className="lucide lucide-file-archive size-4" aria-hidden="true" />;
  }
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'py', 'md', 'txt', 'csv', 'log', 'pdf', 'sql', 'yaml', 'yml'].includes(ext)) {
    return <FileText className="lucide lucide-file-text size-4" aria-hidden="true" />;
  }
  return <File className="lucide lucide-file size-4" aria-hidden="true" />;
}

export function ComposerAttachmentItem({ attachment, onRemove }) {
  const { name, size, type, previewUrl, state = 'done', progress = 100 } = attachment || {};
  const isImage =
    (type && type.startsWith('image/')) ||
    /\.(png|jpe?g|gif|webp|ico|bmp|svg)$/i.test(name || '');

  // Note: attachment.order is intentionally kept internal and NEVER rendered in the visible UI.
  return (
    <div
      data-slot="composer-attachment"
      data-state={state}
      className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] relative flex items-center gap-2.5 overflow-hidden rounded-[14px] py-1.5 ps-1.5 pe-2.5 border border-white/[0.07]"
    >
      <span className="bg-background text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-[10px] dark:bg-white/10 overflow-hidden">
        {isImage && previewUrl ? (
          <img src={previewUrl} alt={name} className="size-full object-cover" />
        ) : (
          getFileCategoryIcon(type, name)
        )}
      </span>
      <span className="flex flex-col min-w-0">
        <span className="max-w-36 truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
          {name}
        </span>
        <span
          className={`text-[11px] ${
            state === 'error'
              ? 'text-red-600/80 dark:text-red-400/80'
              : 'text-muted-foreground'
          }`}
        >
          {state === 'uploading' ? 'uploading' : formatFileSize(size)}
        </span>
      </span>
      {(state === 'uploading' || onRemove) && (
        <span className="ms-1 flex w-5 items-center justify-end">
          {state === 'uploading' ? (
            <Loader2
              className="lucide lucide-loader-2 text-muted-foreground size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : onRemove ? (
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(attachment);
              }}
              className="flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09] size-5 [&_svg]:size-3 cursor-pointer"
            >
              <X className="lucide lucide-x" aria-hidden="true" />
            </button>
          ) : (
            <Check className="size-3.5 text-emerald-500" />
          )}
        </span>
      )}
      {state === 'uploading' && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-500/70 transition-[width] duration-300 dark:bg-blue-400/70"
          style={{ width: `${Math.max(5, Math.min(100, Number(progress) || 20))}%` }}
        />
      )}
    </div>
  );
}

export function ComposerAttachments({ attachments = [], onRemove }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div data-slot="composer-attachments" className="flex flex-wrap gap-2 mb-2.5 w-full">
      {attachments.map((att, idx) => (
        <ComposerAttachmentItem
          key={att.id || `${att.name}-${idx}`}
          attachment={att}
          onRemove={onRemove ? () => onRemove(idx, att) : undefined}
        />
      ))}
    </div>
  );
}

export function ComposerAddAttachment({ onClick }) {
  return (
    <TooltipIconButton
      tooltip="Attach file (Ctrl+U)"
      onClick={onClick}
      className="size-7 rounded-full text-zinc-500 hover:text-zinc-300 transition-colors"
    >
      <Paperclip className="size-3.5" />
    </TooltipIconButton>
  );
}

export function UserMessageAttachments({ attachments = [] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div
      data-slot="user-message-attachments"
      className="flex flex-wrap justify-end gap-2 mb-1 max-w-[85%]"
    >
      {attachments.map((att, idx) => (
        <ComposerAttachmentItem
          key={att.id || `${att.name}-${idx}`}
          attachment={{ ...att, state: 'done' }}
        />
      ))}
    </div>
  );
}
