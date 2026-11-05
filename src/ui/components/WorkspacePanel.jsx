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
  FileText,
  Play
} from 'lucide-react';
import { LiveBrowserStream } from './LiveBrowserStream';
import { FileCodeViewer, getFileIcon } from './FileCodeViewer';
import { getUserId } from '@/lib/user';

export function WorkspacePanel({
  streamState,
  onSimulateUrlChange,
  onManualNavigate,
  onSendWsMessage,
  openFiles = [],
  activeTabId = 'browser',
  onSelectTab,
  onCloseFileTab,
  onClosePanel,
  threadId = null
}) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [treeLayout, setTreeLayout] = useState('closed'); // closed | tree | split
  const [filter, setFilter] = useState('');
  const [sandboxFiles, setSandboxFiles] = useState([]);
  const [collapsedFolders, setCollapsedFolders] = useState({});

  // Load the signed-in user's sandboxed file list for the current thread
  const loadSandboxFiles = async () => {
    try {
      const url = threadId
        ? `/api/workspace/files?threadId=${encodeURIComponent(threadId)}`
        : '/api/workspace/files';
      const res = await fetch(url, {
        headers: {
          'x-user-id': getUserId(),
          ...(threadId ? { 'x-thread-id': threadId } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.files)) {
        setSandboxFiles(data.files);
      } else {
        setSandboxFiles([]);
      }
    } catch {
      setSandboxFiles([]);
    }
  };

  useEffect(() => {
    loadSandboxFiles();
  }, [threadId]);

  useEffect(() => {
    if (treeLayout !== 'closed') loadSandboxFiles();
  }, [treeLayout, openFiles.length, threadId]);

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
  // Sandboxed workspace only: the explorer lists files from this user's own
  // server sandbox folder (GET /api/workspace/files). Root/system files are
  // never listed, read, or displayed here.
  const treeFiles = sandboxFiles;
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

  // Spin up the live browser (server auto-launches Chromium on any WS
  // message and starts streaming frames back) when the Browser tab opens.
  const spinUpBrowser = () => {
    if (!streamState?.liveFrame && onSendWsMessage) {
      const target =
        streamState?.url && streamState.url !== 'about:blank'
          ? streamState.url
          : 'https://duckduckgo.com';
      onSendWsMessage({ type: 'navigate', url: target });
    }
  };

  const handleBrowserTabClick = () => {
    selectTab('browser');
    spinUpBrowser();
  };

  const handleTreeToggle = () => {
    setTreeLayout((prev) => {
      if (prev !== 'closed') return 'closed';
      return activeFile ? 'split' : 'tree';
    });
  };

  const handleTreeFileClick = async (f) => {
    const fid = f.path || f.name;
    const isOpen = openFiles.some((o) => (o.id || o.path || o.name) === fid);
    if (isOpen) {
      onSelectTab(fid);
      setTreeLayout('split');
      return;
    }
    try {
      const url = threadId
        ? `/api/workspace/file?path=${encodeURIComponent(f.path)}&threadId=${encodeURIComponent(threadId)}`
        : `/api/workspace/file?path=${encodeURIComponent(f.path)}`;
      const res = await fetch(url, {
        headers: {
          'x-user-id': getUserId(),
          ...(threadId ? { 'x-thread-id': threadId } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.file) {
        window.dispatchEvent(new CustomEvent('dotta:open-file', { detail: data.file }));
      }
    } catch {}
    setTreeLayout('split');
  };

  const hasPreviewable = sandboxFiles.some(
    (f) => (f.name || '').endsWith('.html') || (f.path || '').endsWith('.html')
  );

  const handleLaunchPreview = () => {
    if (!threadId) return;
    const previewUrl = `http://localhost:3001/api/workspace/preview/${encodeURIComponent(threadId)}/`;
    if (onSendWsMessage) {
      onSendWsMessage({ type: 'navigate', url: previewUrl });
    }
    selectTab('browser');
  };

  const groupedTree = React.useMemo(() => {
    const folders = new Map();
    const rootFiles = [];
    for (const f of visibleTreeFiles) {
      const rawPath = String(f.path || f.name || '').replace(/\\/g, '/');
      const lastSlash = rawPath.lastIndexOf('/');
      if (lastSlash === -1) {
        rootFiles.push(f);
      } else {
        const folder = rawPath.slice(0, lastSlash);
        if (!folders.has(folder)) {
          folders.set(folder, []);
        }
        folders.get(folder).push(f);
      }
    }
    return {
      sortedFolders: Array.from(folders.keys()).sort(),
      folders,
      rootFiles
    };
  }, [visibleTreeFiles]);

  const toggleFolder = (folderPath) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }));
  };

  // Safe display name only: never render root/system directory paths.
  const rawRelPath = activeFile ? activeFile.path || activeFile.name || '' : '';
  const pathParts = rawRelPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const pathFileName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';

  const handleSelectFilesFromLauncher = () => {
    if (openFiles.length > 0) {
      const firstId = openFiles[0].id || openFiles[0].path || openFiles[0].name;
      onSelectTab(firstId);
    } else {
      // No sandboxed workspace files yet: stay on the launcher, show no directory.
      onSelectTab('plus');
    }
  };

  return (
    <aside
      className={`h-full flex flex-col bg-[#141417] border-l border-white/[0.06] text-zinc-200 font-sans transition-all duration-200 z-20 overflow-hidden ${
        isMaximized
          ? 'w-full absolute inset-0 z-50'
          : 'w-full lg:w-[480px] xl:w-[620px] 2xl:w-[740px] lg:max-w-[55%] shrink-0'
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
          <div
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition shrink-0 ${
              activeTabId === 'browser'
                ? 'bg-white/[0.07] border border-white/10 shadow-sm text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title="Browser Viewport"
          >
            <button
              type="button"
              onClick={handleBrowserTabClick}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <Globe size={13} className="text-zinc-400" />
              <span>Browser</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectTab('plus');
              }}
              className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition cursor-pointer ml-0.5"
              title="Close browser tab"
              aria-label="Close browser tab"
            >
              <X size={11} />
            </button>
          </div>

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

        {/* Right: Window Controls (Maximize / Minimize, Close Panel - Hidden on mobile/tablet below the sheet close icon) */}
        <div className="hidden lg:flex items-center gap-1 shrink-0 ml-2">
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
          <span className="shrink-0 text-zinc-500">Workspace</span>
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
            <div className="flex items-center justify-between px-3 pt-3 pb-2 text-[13px] font-semibold text-zinc-100">
              <div className="flex items-center gap-1.5">
                <ChevronDown size={14} className="shrink-0 text-zinc-500" />
                <span>Files</span>
              </div>
              {hasPreviewable && (
                <button
                  type="button"
                  onClick={handleLaunchPreview}
                  title="Open live preview in browser"
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition cursor-pointer"
                >
                  <Play size={10} className="fill-emerald-400" />
                  <span>Preview</span>
                </button>
              )}
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
              {/* Render Folders First */}
              {groupedTree.sortedFolders.map((folderPath) => {
                const folderFiles = groupedTree.folders.get(folderPath) || [];
                const isCollapsed = collapsedFolders[folderPath];
                return (
                  <div key={folderPath} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => toggleFolder(folderPath)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-left text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer select-none"
                    >
                      {isCollapsed ? (
                        <ChevronRight size={13} className="text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronDown size={13} className="text-zinc-500 shrink-0" />
                      )}
                      <Folder size={13} className="text-amber-400/80 shrink-0" />
                      <span className="truncate font-medium text-zinc-300">{folderPath}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">{folderFiles.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="pl-3 space-y-0.5 border-l border-white/[0.06] ml-3">
                        {folderFiles.map((f) => {
                          const fid = f.path || f.name;
                          const fname = f.name || f.path.split(/[/\\]/).pop();
                          const isRowActive = !!activeFile && activeTabId === fid;
                          return (
                            <button
                              key={fid}
                              type="button"
                              onClick={() => handleTreeFileClick(f)}
                              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition cursor-pointer ${
                                isRowActive
                                  ? 'bg-white/[0.06] text-zinc-100 font-medium'
                                  : 'text-zinc-300 hover:bg-white/[0.04]'
                              }`}
                            >
                              {getFileIcon(fname)}
                              <span className="truncate">{fname}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Render Root Files */}
              {groupedTree.rootFiles.map((f) => {
                const fid = f.path || f.name;
                const fname = f.name || (f.path ? f.path.split(/[/\\]/).pop() : 'untitled');
                const isRowActive = !!activeFile && activeTabId === fid;
                return (
                  <button
                    key={fid}
                    type="button"
                    onClick={() => handleTreeFileClick(f)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition cursor-pointer ${
                      isRowActive
                        ? 'bg-white/[0.06] text-zinc-100 font-medium'
                        : 'text-zinc-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {getFileIcon(fname)}
                    <span className="truncate">{fname}</span>
                  </button>
                );
              })}

              {visibleTreeFiles.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-zinc-500">
                  {sandboxFiles.length === 0
                    ? 'No files in this thread yet.'
                    : 'No files match.'}
                </p>
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
                  onSelectBrowser={handleBrowserTabClick}
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
