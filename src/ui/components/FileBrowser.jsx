import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Search,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  File as FileIcon
} from 'lucide-react';

export function ReactIcon({ className = "size-3.5 text-cyan-400" }) {
  return (
    <svg className={className} viewBox="-11.5 -10.23174 23 20.46348" fill="currentColor">
      <circle cx="0" cy="0" r="2.05" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  );
}

export function getFileIcon(filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return <ReactIcon className="size-3.5 text-cyan-400 shrink-0" />;
    case 'ts':
      return <span className="font-mono text-[10px] font-bold text-sky-400 shrink-0">TS</span>;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <span className="font-mono text-[10px] font-bold text-amber-400 shrink-0">JS</span>;
    case 'json':
      return <span className="font-mono text-[10px] font-bold text-yellow-300 shrink-0">&#123; &#125;</span>;
    case 'html':
      return <span className="font-mono text-[10px] font-bold text-orange-400 shrink-0">HTML</span>;
    case 'css':
      return <span className="font-mono text-[10px] font-bold text-blue-400 shrink-0">CSS</span>;
    case 'md':
      return <FileText size={13} className="text-zinc-400 shrink-0" />;
    default:
      return <FileCode size={13} className="text-zinc-400 shrink-0" />;
  }
}

export function FileBrowser({ onOpenFile }) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [filesTree, setFilesTree] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState({
    'src': true,
    'src/ui': true,
    'src/ui/components': true,
    'src/ui/components/assistant-ui': true,
    'src/ui/components/assistant-ui/elements': true
  });

  const fetchWorkspaceFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/files');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.files)) {
          setFilesTree(data.files);
        }
      }
    } catch (err) {
      console.warn('[FileBrowser] Failed to fetch workspace files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaceFiles();
  }, []);

  const toggleFolder = (folderPath) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }));
  };

  const handleFileClick = async (file) => {
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(file.path)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          onOpenFile({
            name: file.name,
            path: file.path,
            content: data.content
          });
          return;
        }
      }
    } catch (err) {
      console.warn('[FileBrowser] Error reading file:', err);
    }
    // Fallback if read fails
    onOpenFile({
      name: file.name,
      path: file.path,
      content: `// File: ${file.path}\n// Unable to load content from workspace server.`
    });
  };

  // Filter items matching search
  const filterNodes = (nodes, query) => {
    if (!query) return nodes;
    const lower = query.toLowerCase();
    const result = [];
    for (const node of nodes) {
      if (node.type === 'file') {
        if (node.name.toLowerCase().includes(lower) || (node.path && node.path.toLowerCase().includes(lower))) {
          result.push(node);
        }
      } else if (node.type === 'folder') {
        const matchingChildren = filterNodes(node.children || [], query);
        if (matchingChildren.length > 0 || node.name.toLowerCase().includes(lower)) {
          result.push({
            ...node,
            children: matchingChildren
          });
        }
      }
    }
    return result;
  };

  const displayedTree = useMemo(() => {
    return filterNodes(filesTree, search);
  }, [filesTree, search]);

  const renderTree = (items, depth = 0) => {
    if (!items || items.length === 0) return null;

    return items.map((item, idx) => {
      const isFolder = item.type === 'folder';
      const isExpanded = isFolder && (search ? true : !!expandedFolders[item.path]);
      const indent = depth * 14 + 10;

      if (isFolder) {
        return (
          <div key={`folder-${item.path || idx}`}>
            <button
              type="button"
              onClick={() => toggleFolder(item.path)}
              style={{ paddingLeft: `${indent}px` }}
              className="w-full flex items-center gap-1.5 py-1 px-2 rounded hover:bg-white/[0.04] text-xs text-zinc-300 font-sans text-left transition select-none cursor-pointer group"
            >
              {isExpanded ? (
                <ChevronDown size={13} className="text-zinc-500 group-hover:text-zinc-300 shrink-0" />
              ) : (
                <ChevronRight size={13} className="text-zinc-500 group-hover:text-zinc-300 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen size={14} className="text-amber-400/80 shrink-0" />
              ) : (
                <Folder size={14} className="text-amber-400/70 shrink-0" />
              )}
              <span className="truncate group-hover:text-white">{item.name}</span>
            </button>
            {isExpanded && item.children && item.children.length > 0 && (
              <div className="flex flex-col">
                {renderTree(item.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      return (
        <button
          key={`file-${item.path || idx}`}
          type="button"
          onClick={() => handleFileClick(item)}
          style={{ paddingLeft: `${indent + 16}px` }}
          className="w-full flex items-center gap-2 py-1 px-2 rounded hover:bg-white/[0.06] text-xs text-zinc-400 hover:text-zinc-100 font-sans text-left transition select-none cursor-pointer group"
        >
          {getFileIcon(item.name)}
          <span className="truncate font-mono text-[12px] group-hover:text-white">
            {item.name}
          </span>
        </button>
      );
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0e0b] text-zinc-200 select-none overflow-hidden">
      {/* Search Header */}
      <div className="p-2.5 border-b border-[#182018] flex items-center gap-2 bg-[#0d100d]">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspace files..."
            className="w-full bg-[#141a14] border border-[#232d23] rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500/50 transition font-sans"
          />
        </div>
        <button
          type="button"
          onClick={fetchWorkspaceFiles}
          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
          title="Refresh files"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-emerald-400" : ""} />
        </button>
      </div>

      {/* File Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
        {displayedTree.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-xs font-sans">
            {loading ? 'Scanning workspace files...' : 'No files found matching your search.'}
          </div>
        ) : (
          renderTree(displayedTree)
        )}
      </div>
    </div>
  );
}

export default FileBrowser;
