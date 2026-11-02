import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  ExternalLink,
  X,
  Maximize2,
  Minimize2,
  Search,
  CheckCircle,
  Clock,
  Laptop
} from 'lucide-react';

export function LiveBrowserSidebar({
  isOpen,
  onClose,
  browserState = {},
  onNavigate
}) {
  const [currentUrl, setCurrentUrl] = useState(browserState.url || 'https://duckduckgo.com');
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'dom' | 'history'

  useEffect(() => {
    if (browserState.url) {
      setCurrentUrl(browserState.url);
    }
  }, [browserState.url]);

  const handleNavigateSubmit = (e) => {
    e.preventDefault();
    if (!currentUrl) return;
    onNavigate?.(currentUrl);
  };

  if (!isOpen) return null;

  return (
    <aside className="w-[440px] max-w-[50vw] h-full border-l border-zinc-800 bg-[#101012] flex flex-col shrink-0 text-zinc-200 z-20 shadow-2xl transition-all">
      {/* Browser Chrome Header */}
      <div className="h-13 border-b border-zinc-800/80 px-3 flex items-center justify-between gap-2 bg-[#0c0c0e]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
            disabled
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
            disabled
            title="Forward"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.(currentUrl)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            title="Reload"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Address Input */}
        <form onSubmit={handleNavigateSubmit} className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus-within:border-zinc-700">
            <Globe className="w-3 h-3 text-sky-400 shrink-0" />
            <input
              type="text"
              value={currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              className="bg-transparent w-full focus:outline-none text-xs text-zinc-200 placeholder-zinc-500 font-mono"
              placeholder="Enter URL..."
            />
          </div>
        </form>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          title="Close Browser Sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Viewport Tabs */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/60 bg-zinc-900/40 text-[11px] text-zinc-400">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-2 py-0.5 rounded transition ${
              activeTab === 'preview' ? 'bg-zinc-800 text-zinc-200 font-medium' : 'hover:text-zinc-200'
            }`}
          >
            Live Preview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dom')}
            className={`px-2 py-0.5 rounded transition ${
              activeTab === 'dom' ? 'bg-zinc-800 text-zinc-200 font-medium' : 'hover:text-zinc-200'
            }`}
          >
            DOM Extract
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-500 font-mono text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Active</span>
        </div>
      </div>

      {/* Main Viewport Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'preview' && (
          <div className="space-y-4">
            {/* Target Card */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-300">
                  {browserState.title || 'Live Browser'}
                </span>
                {browserState.url && (
                  <a
                    href={browserState.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:text-sky-300 flex items-center gap-1 text-[11px]"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="text-[11px] text-zinc-400 font-mono truncate">
                {browserState.url || 'No page loaded yet.'}
              </div>
            </div>

            {/* Live Search or Scraped Results Display */}
            {browserState.results && browserState.results.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Discovered Results
                </div>
                {browserState.results.map((res, rIdx) => (
                  <div
                    key={rIdx}
                    className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition space-y-1.5"
                  >
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-sky-400 hover:text-sky-300 block"
                    >
                      {res.title}
                    </a>
                    <div className="text-[11px] text-zinc-400 line-clamp-2">
                      {res.snippet}
                    </div>
                  </div>
                ))}
              </div>
            ) : browserState.content ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Page Content
                </div>
                <div className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto font-mono">
                  {browserState.content}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                  <Globe className="w-5 h-5 text-sky-400/70" />
                </div>
                <div className="text-xs text-zinc-400 font-medium">Browser Stream Ready</div>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  When Dotta searches the web or reads a URL, live discoveries and webpage snapshots will appear here.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'dom' && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              DOM State
            </div>
            <pre className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 text-[11px] text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(
                {
                  url: browserState.url || 'about:blank',
                  title: browserState.title || 'Empty',
                  timestamp: browserState.timestamp || Date.now(),
                  activeTools: ['browser_search', 'browser_read_page', 'browser_action']
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
}
