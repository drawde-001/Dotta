import React, { useState } from 'react';
import {
  Globe,
  Plus,
  X,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  FolderOpen
} from 'lucide-react';
import { LiveBrowserStream } from './LiveBrowserStream';
import { FileCodeViewer } from './FileCodeViewer';
import { FileBrowser, getFileIcon } from './FileBrowser';

export function WorkspacePanel({
  streamState,
  onSimulateUrlChange,
  onManualNavigate,
  onSendWsMessage,
  openFiles = [],
  activeTabId = 'browser',
  onSelectTab,
  onCloseFileTab,
  onOpenFile,
  onClosePanel
}) {
  const [isMaximized, setIsMaximized] = useState(false);

  // Find active file if viewing a file
  const activeFile = openFiles.find((f) => (f.id || f.path || f.name) === activeTabId);

  return (
    <aside
      className={`h-full flex flex-col bg-[#0b0e0b] border-r border-[#1c221c] text-zinc-200 font-sans transition-all duration-200 z-20 overflow-hidden ${
        isMaximized
          ? 'w-full absolute inset-0 z-50'
          : 'w-full md:w-[480px] lg:w-[560px] xl:w-[620px] shrink-0'
      }`}
    >
      {/* Top Tab Bar ("Button Cards" - Matching Screenshot 2 Row 1 exactly) */}
      <div className="h-11 px-3 flex items-center justify-between shrink-0 bg-[#0c0e0c] border-b border-[#1c221c] select-none">
        {/* Left: Button cards for active windows (Browser, Open Files, + for File Browser) */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
          {/* 1. Browser Button Card */}
          <button
            type="button"
            onClick={() => onSelectTab('browser')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition cursor-pointer shrink-0 ${
              activeTabId === 'browser'
                ? 'bg-[#1a201a] border border-white/10 shadow-sm text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title="Browser Viewport"
          >
            <Globe size={13} className={activeTabId === 'browser' ? 'text-emerald-400' : 'text-zinc-400'} />
            <span>Browser</span>
          </button>

          {/* 2. Open File Button Cards (NO placeholders, strictly active open files) */}
          {openFiles.map((f) => {
            const fileId = f.id || f.path || f.name;
            const isActive = activeTabId === fileId;
            const fileName = f.name || (f.path ? f.path.split(/[/\\]/).pop() : 'untitled');

            return (
              <div
                key={fileId}
                onClick={() => onSelectTab(fileId)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#1a201a] border border-white/10 shadow-sm text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
                title={f.path || fileName}
              >
                {getFileIcon(fileName)}
                <span className="truncate max-w-[130px] italic">
                  {fileName}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseFileTab(fileId);
                  }}
                  className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition cursor-pointer ml-0.5"
                  title="Close tab"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}

          {/* 3. Plus Button Card: Takes user to the File Browser */}
          <button
            type="button"
            onClick={() => onSelectTab('file-browser')}
            className={`p-1.5 rounded-lg text-xs transition cursor-pointer shrink-0 ${
              activeTabId === 'file-browser'
                ? 'bg-[#1a201a] border border-white/10 shadow-sm text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title="Open file browser"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Right: Window Controls (Maximize / Minimize, Close Panel) */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setIsMaximized((prev) => !prev)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title={isMaximized ? 'Restore size' : 'Expand panel'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            type="button"
            onClick={onClosePanel}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title="Close workspace panel"
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      {/* Main Panel Content - Driven by activeTabId */}
      <div className="flex-1 overflow-hidden relative">
        {activeTabId === 'browser' && (
          <div className="h-full w-full flex flex-col">
            <LiveBrowserStream
              streamState={streamState}
              onSimulateUrlChange={onSimulateUrlChange}
              onManualNavigate={onManualNavigate}
              onSendWsMessage={onSendWsMessage}
            />
          </div>
        )}

        {activeTabId === 'file-browser' && (
          <FileBrowser
            onOpenFile={(file) => {
              onOpenFile(file);
            }}
          />
        )}

        {activeTabId !== 'browser' && activeTabId !== 'file-browser' && activeFile && (
          <FileCodeViewer file={activeFile} />
        )}
      </div>
    </aside>
  );
}

export default WorkspacePanel;
