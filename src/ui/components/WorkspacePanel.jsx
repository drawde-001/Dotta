import React, { useState, useEffect } from 'react';
import {
  Globe,
  Folder,
  Plus,
  X,
  Maximize2,
  Minimize2,
  PanelRightClose,
  FolderTree,
  ChevronDown,
  ChevronRight,
  Search,
  FileText
} from 'lucide-react';
import { LiveBrowserStream } from './LiveBrowserStream';
import { FileCodeViewer, getFileIcon } from './FileCodeViewer';

const FALLBACK_FILE = {
  name: 'task-card.tsx',
  path: 'src/ui/components/assistant-ui/elements/task-card.tsx',
  content: `import React from 'react';\n\nexport function TaskCard({\n  title,\n  status,\n  steps,\n  className\n}) {\n  return (\n    <div className={className}>\n      <h3>{title}</h3>\n      <span>Status: {status}</span>\n    </div>\n  );\n}`
};

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
  const [treeLayout, setTreeLayout] = useState('closed'); // closed | tree | split
  const [filter, setFilter] = useState('');

  // Keyboard shortcuts matching launcher card hints (Ctrl+T for Browser, Ctrl+P for Files)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setTreeLayout('closed');
        onSelectTab('browser');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setTreeLayout('closed');
        if (openFiles.length > 0) {
          const firstId = openFiles[0].id || openFiles[0].path || openFiles[0].name;
          onSelectTab(firstId);
        } else {
          onSelectTab('plus');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openFiles, onSelectTab]);

  // Find active file if viewing a file
  const activeFile = openFiles.find((f) => (f.id || f.path || f.name) === activeTabId);

  // File explorer (preview logic): Browser tab -> tree takes the full panel;
  // file tab -> tree shares the panel at 210px beside the file.
  const effectiveTreeLayout = treeLayout === 'split' && !activeFile ? 'tree' : treeLayout;
  const treeFiles = openFiles.length > 0 ? openFiles : [FALLBACK_FILE];
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleTreeFiles = treeFiles.filter((f) => {
    const n = (f.name || '').toLowerCase();
    const p = (f.path || '').toLowerCase();
    return !normalizedFilter || n.includes(normalizedFilter) || p.includes(normalizedFilter);
  });

  const selectTab = (id) => {
    setTreeLayout('closed');
    onSelectTab(id);
  };

  const handleTreeToggle = () => {
    setTreeLayout((prev) => {
      if (prev !== 'closed') return 'closed';
      return activeFile ? 'split' : 'tree';
    });
  };

  const handleTreeFileClick = (f) => {
    const fid = f.id || f.path || f.name;
    const isOpen = openFiles.some((o) => (o.id || o.path || o.name) === fid);
    if (isOpen) {
      onSelectTab(fid);
    } else {
      window.dispatchEvent(new CustomEvent('omni:open-file', { detail: f }));
    }
    setTreeLayout('split');
  };

  const rawRelPath = activeFile ? activeFile.path || activeFile.name || '' : '';
  const pathParts = rawRelPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const pathDirs = pathParts.slice(0, -1);
  const pathFileName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';

  const handleSelectFilesFromLauncher = () => {
    if (openFiles.length > 0) {
      const firstId = openFiles[0].id || openFiles[0].path || openFiles[0].name;
      onSelectTab(firstId);
    } else {
      // If no file opened yet, open default visual file card
      onSelectTab(FALLBACK_FILE.path);
    }
  };

  return (
    <aside
      className={`h-full flex flex-col bg-[#141417] border-l border-white/[0.06] text-zinc-200 font-sans transition-all duration-200 z-20 overflow-hidden ${
        isMaximized
          ? 'w-full absolute inset-0 z-50'
          : 'w-full md:w-[480px] lg:w-[560px] xl:w-[620px] shrink-0'
      }`}
    >
      {/* Top Tab Bar ("Button Cards" on the right workspace side) */}
      <div className="h-11 px-3 flex items-center justify-between shrink-0 bg-white/[0.02] border-b border-white/[0.06] select-none">
        {/* Left: File tree toggle, then button cards for active windows */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={handleTreeToggle}
            aria-pressed={effectiveTreeLayout !== 'closed'}
            aria-label="Toggle file explorer"
            title="Files"
            className={`p-1.5 rounded-md transition cursor-pointer shrink-0 ${
              effectiveTreeLayout !== 'closed'
                ? 'bg-white/[0.08] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
            }`}
          >
            <FolderTree size={15} />
          </button>
          {/* 1. Browser Button Card */}
          <button
            type="button"
            onClick={() => selectTab('browser')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition cursor-pointer shrink-0 ${
              activeTabId === 'browser'
                ? 'bg-white/[0.07] border border-white/10 shadow-sm text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title="Browser Viewport"
          >
            <Globe size={13} className="text-zinc-400" />
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
                onClick={() => selectTab(fileId)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-white/[0.07] border border-white/10 shadow-sm text-zinc-100 font-medium'
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

          {/* 3. Plus Button: Clicking plus shows the idle browser screen and uses same fill as hover */}
          <button
            type="button"
            onClick={() => selectTab('plus')}
            className={`p-1.5 rounded-lg text-xs transition cursor-pointer shrink-0 ${
              activeTabId === 'plus'
                ? 'bg-white/10 text-white'
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

      {/* File path bar (file view only) */}
      {activeFile && effectiveTreeLayout !== 'tree' && (
        <div className="flex h-8 shrink-0 items-center gap-1.5 overflow-hidden border-b border-white/[0.06] px-3 text-[11px] select-none">
          <span className="shrink-0 text-zinc-500">omni-agent</span>
          {pathDirs.map((seg, idx) => (
            <span key={idx} className="flex shrink-0 items-center gap-1.5">
              <ChevronRight size={12} className="text-zinc-600" />
              <span className="text-zinc-500">{seg}</span>
            </span>
          ))}
          <ChevronRight size={12} className="shrink-0 text-zinc-600" />
          <FileText size={13} className="shrink-0 text-zinc-500" />
          <span className="truncate font-medium text-zinc-300">{pathFileName}</span>
        </div>
      )}

      {/* Main Panel Content: file explorer + panes (LiveBrowserStream / FileCodeViewer) */}
      <div className="flex flex-1 overflow-hidden relative bg-[#08080a]">
        {effectiveTreeLayout !== 'closed' && (
          <div
            className={`flex shrink-0 flex-col min-h-0 ${
              effectiveTreeLayout === 'split'
                ? 'w-[210px] border-r border-white/[0.06]'
                : 'w-full'
            }`}
          >
            <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 text-[13px] font-semibold text-zinc-100">
              <ChevronDown size={14} className="shrink-0 text-zinc-500" />
              omni-agent
            </div>
            <div className="px-2.5 pb-2">
              <div className="flex h-8 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 transition-colors focus-within:border-zinc-600">
                <Search size={14} className="shrink-0 text-zinc-500" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter files"
                  aria-label="Filter files"
                  className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-2">
              {visibleTreeFiles.map((f) => {
                const fid = f.id || f.path || f.name;
                const fname = f.name || (f.path ? f.path.split(/[/\\]/).pop() : 'untitled');
                const isRowActive = !!activeFile && activeTabId === fid;
                return (
                  <button
                    key={fid}
                    type="button"
                    onClick={() => handleTreeFileClick(f)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition cursor-pointer ${
                      isRowActive
                        ? 'bg-white/[0.06] text-zinc-100'
                        : 'text-zinc-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {getFileIcon(fname)}
                    <span className="truncate">{fname}</span>
                  </button>
                );
              })}
              {visibleTreeFiles.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-zinc-500">No files match.</p>
              )}
            </div>
          </div>
        )}

        {effectiveTreeLayout !== 'tree' && (
          <div className="relative min-w-0 flex-1 overflow-hidden">
            {/* Browser or Plus Idle View (reusing LiveBrowserStream's exact built-in screen) */}
            {(activeTabId === 'browser' || activeTabId === 'plus') && (
              <div className="h-full w-full flex flex-col">
                <LiveBrowserStream
                  streamState={streamState}
                  onSimulateUrlChange={onSimulateUrlChange}
                  onManualNavigate={onManualNavigate}
                  onSendWsMessage={onSendWsMessage}
                  onOpenFiles={handleSelectFilesFromLauncher}
                  onSelectBrowser={() => selectTab('browser')}
                  forceIdle={activeTabId === 'plus'}
                />
              </div>
            )}

            {/* Visual File Code Viewer (Strictly in-memory visual display only) */}
            {activeTabId !== 'browser' && activeTabId !== 'plus' && activeFile && (
              <FileCodeViewer file={activeFile} />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default WorkspacePanel;
