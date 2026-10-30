import React, { useState, useEffect } from 'react';
import {
  Globe,
  Folder,
  Plus,
  X,
  Maximize2,
  Minimize2,
  PanelRightClose
} from 'lucide-react';
import { LiveBrowserStream } from './LiveBrowserStream';
import { FileCodeViewer, getFileIcon } from './FileCodeViewer';

export function WorkspacePanel({
  streamState,
  onSimulateUrlChange,
  onManualNavigate,
  onSendWsMessage,
  openFiles = [],
  activeTabId = 'browser',
  onSelectTab,
  onCloseFileTab,
  onClosePanel
}) {
  const [isMaximized, setIsMaximized] = useState(false);

  // Keyboard shortcuts matching launcher card hints (Ctrl+T for Browser, Ctrl+P for Files)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        onSelectTab('browser');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (openFiles.length > 0) {
          const firstId = openFiles[0].id || openFiles[0].path || openFiles[0].name;
          onSelectTab(firstId);
        } else {
          onSelectTab('launcher');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openFiles, onSelectTab]);

  // Find active file if viewing a file
  const activeFile = openFiles.find((f) => (f.id || f.path || f.name) === activeTabId);

  const handleSelectFilesFromLauncher = () => {
    if (openFiles.length > 0) {
      const firstId = openFiles[0].id || openFiles[0].path || openFiles[0].name;
      onSelectTab(firstId);
    } else {
      // If no file opened yet, open default visual file card
      const fallbackFile = {
        name: 'task-card.tsx',
        path: 'src/ui/components/assistant-ui/elements/task-card.tsx',
        content: `import React from 'react';\n\nexport function TaskCard({\n  title,\n  status,\n  steps,\n  className\n}) {\n  return (\n    <div className={className}>\n      <h3>{title}</h3>\n      <span>Status: {status}</span>\n    </div>\n  );\n}`
      };
      onSelectTab(fallbackFile.path);
    }
  };

  return (
    <aside
      className={`h-full flex flex-col bg-[#08080a] border-l border-[#1c221c] text-zinc-200 font-sans transition-all duration-200 z-20 overflow-hidden ${
        isMaximized
          ? 'w-full absolute inset-0 z-50'
          : 'w-full md:w-[480px] lg:w-[560px] xl:w-[620px] shrink-0'
      }`}
    >
      {/* Top Tab Bar ("Button Cards" on the right workspace side) */}
      <div className="h-11 px-3 flex items-center justify-between shrink-0 bg-[#0c0e0c] border-b border-[#1c221c] select-none">
        {/* Left: Button cards for active windows (Browser, Open Files, + for Launcher) */}
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

          {/* 2. Open File Button Cards (Strictly active open windows only) */}
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

          {/* 3. Plus Button Card: Clicking plus opens the launcher layout in Image 2 */}
          <button
            type="button"
            onClick={() => onSelectTab('launcher')}
            className={`p-1.5 rounded-lg text-xs transition cursor-pointer shrink-0 ${
              activeTabId === 'launcher'
                ? 'bg-[#1a201a] border border-white/10 shadow-sm text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title="New tab options"
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
            <PanelRightClose size={15} />
          </button>
        </div>
      </div>

      {/* Main Panel Content - Driven by activeTabId */}
      <div className="flex-1 overflow-hidden relative bg-[#08080a]">
        {/* View 1: Browser Viewport */}
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

        {/* View 2: Plus Icon Launcher Screen (Exact Pixel-Match to Screenshot 2) */}
        {activeTabId === 'launcher' && (
          <div className="h-full w-full flex items-center justify-center p-6 bg-[#08080a] select-none">
            <div className="w-full max-w-[340px] flex flex-col gap-2.5">
              {/* Browser Option */}
              <button
                type="button"
                onClick={() => onSelectTab('browser')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.08] bg-[#121418] hover:bg-[#181a20] hover:border-white/15 text-zinc-200 transition cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <Globe size={16} className="text-zinc-400 group-hover:text-white transition" />
                  <span className="text-sm font-medium text-zinc-200 group-hover:text-white">Browser</span>
                </div>
                <span className="text-xs text-zinc-500 font-sans tracking-tight">
                  Ctrl+T
                </span>
              </button>

              {/* Files Option */}
              <button
                type="button"
                onClick={handleSelectFilesFromLauncher}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.08] bg-[#121418] hover:bg-[#181a20] hover:border-white/15 text-zinc-200 transition cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <Folder size={16} className="text-zinc-400 group-hover:text-white transition" />
                  <span className="text-sm font-medium text-zinc-200 group-hover:text-white">Files</span>
                </div>
                <span className="text-xs text-zinc-500 font-sans tracking-tight">
                  Ctrl+P
                </span>
              </button>
            </div>
          </div>
        )}

        {/* View 3: Visual File Code Viewer (Strictly in-memory visual display only) */}
        {activeTabId !== 'browser' && activeTabId !== 'launcher' && activeFile && (
          <FileCodeViewer file={activeFile} />
        )}
      </div>
    </aside>
  );
}

export default WorkspacePanel;
