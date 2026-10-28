import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Folder
} from 'lucide-react';

export function LiveBrowserStream({ isOpen, onClose, onOpen }) {
  const [url, setUrl] = useState('https://duckduckgo.com');
  const [inputUrl, setInputUrl] = useState('https://duckduckgo.com');
  const [liveFrame, setLiveFrame] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [fps, setFps] = useState(0);

  const wsRef = useRef(null);
  const imgRef = useRef(null);
  const viewportRef = useRef(null);
  const lastMoveRef = useRef(0);
  const frameCountRef = useRef(0);

  // Connect to WebSocket stream
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let fpsTimer = null;

    function connect() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        ws = new WebSocket(`${protocol}//${host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'frame' && data.data) {
              setLiveFrame(data.data);
              frameCountRef.current++;
              if (onOpen) onOpen();
              if (data.url && data.url !== 'about:blank') {
                setUrl(data.url);
                setInputUrl(data.url);
              }
            } else if (data.type === 'init' && data.url) {
              setUrl(data.url);
              setInputUrl(data.url);
            } else if (data.type === 'navigated' && data.url) {
              setUrl(data.url);
              setInputUrl(data.url);
              if (onOpen) onOpen();
            }
          } catch {}
        };

        ws.onclose = () => {
          setIsConnected(false);
          reconnectTimer = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          setIsConnected(false);
        };
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    fpsTimer = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(fpsTimer);
      if (ws) ws.close();
    };
  }, [onOpen]);

  const sendWs = (msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const handleNavigate = (e) => {
    e?.preventDefault();
    if (!inputUrl.trim()) return;
    let target = inputUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
    }
    setUrl(target);
    sendWs({ type: 'navigate', url: target });
  };

  // Wheel handling inside the browser frame
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendWs({
        type: 'wheel',
        deltaX: Math.round(e.deltaX),
        deltaY: Math.round(e.deltaY)
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleViewportClick = (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    sendWs({ type: 'click', x, y });
  };

  const handleViewportMouseMove = (e) => {
    if (!imgRef.current) return;
    const now = Date.now();
    if (now - lastMoveRef.current < 50) return;
    lastMoveRef.current = now;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    sendWs({ type: 'move', x, y });
  };

  const handleScroll = (direction, amount = 400) => {
    if (direction === 'top' || direction === 'bottom') {
      sendWs({ type: 'scroll', position: direction });
    } else {
      const deltaY = direction === 'up' ? -amount : amount;
      sendWs({ type: 'scroll', dy: deltaY, deltaY });
    }
  };

  const handleKeyDown = (e) => {
    if (
      e.key === 'Backspace' ||
      e.key === 'Enter' ||
      e.key === 'Tab' ||
      e.key === 'Escape' ||
      e.key.startsWith('Arrow')
    ) {
      e.preventDefault();
      sendWs({ type: 'press', key: e.key });
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      handleScroll('down', 600);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      handleScroll('up', 600);
    } else if (e.key === 'Home') {
      e.preventDefault();
      handleScroll('top');
    } else if (e.key === 'End') {
      e.preventDefault();
      handleScroll('bottom');
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      sendWs({ type: 'type', text: e.key });
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="w-[540px] max-w-[55vw] h-full border-l border-zinc-800 bg-[#0d0d0e] flex flex-col shrink-0 text-zinc-200 z-20 shadow-2xl transition-all">
      {/* Top Address & Controls Chrome */}
      <div className="h-13 border-b border-zinc-800/80 px-3 flex items-center justify-between gap-2 bg-[#0c0c0e]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => sendWs({ type: 'back' })}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => sendWs({ type: 'forward' })}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Forward"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => sendWs({ type: 'reload' })}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Reload"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* URL Bar */}
        <form onSubmit={handleNavigate} className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus-within:border-zinc-700">
            <Globe className="w-3 h-3 text-sky-400 shrink-0" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="bg-transparent w-full focus:outline-none text-xs text-zinc-200 placeholder-zinc-500 font-mono truncate"
              placeholder="https://..."
            />
          </div>
        </form>

        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {fps} fps
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              connecting
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Close Browser View"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Stream Viewport Container */}
      <div
        ref={viewportRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-hidden relative bg-black flex items-center justify-center cursor-crosshair focus:outline-none"
      >
        {liveFrame ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              ref={imgRef}
              src={`data:image/jpeg;base64,${liveFrame}`}
              alt="Live Browser Screencast"
              onClick={handleViewportClick}
              onMouseMove={handleViewportMouseMove}
              className="w-full h-full object-contain select-none pointer-events-auto"
              draggable={false}
            />

            {/* Interactive Scroll Controls Overlay */}
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20 bg-zinc-900/80 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-lg">
              <button
                type="button"
                onClick={() => handleScroll('top')}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                title="Scroll to Top"
              >
                <ChevronsUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleScroll('up')}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                title="Scroll Up"
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleScroll('down')}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                title="Scroll Down"
              >
                <ChevronDown size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleScroll('bottom')}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                title="Scroll to Bottom"
              >
                <ChevronsDown size={13} />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-sky-400 shadow-lg">
              <Globe className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-zinc-200">Chromium Stream Ready</h3>
              <p className="text-xs text-zinc-500 max-w-xs">
                Live 60fps CDP screencast is active. Launch a site or ask Omni to search the web to stream live.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-center max-w-xs mx-auto pt-2">
              {[
                { name: 'DuckDuckGo', url: 'https://duckduckgo.com' },
                { name: 'GitHub', url: 'https://github.com' },
                { name: 'Hacker News', url: 'https://news.ycombinator.com' }
              ].map((site) => (
                <button
                  key={site.name}
                  type="button"
                  onClick={() => {
                    setInputUrl(site.url);
                    setUrl(site.url);
                    sendWs({ type: 'navigate', url: site.url });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
                >
                  {site.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="h-7 border-t border-zinc-800/80 px-3 flex items-center justify-between text-[11px] text-zinc-500 bg-[#0c0c0e] font-mono">
        <span className="truncate max-w-[280px]">{url}</span>
        <div className="flex items-center gap-2">
          <span>1280x800</span>
          <span>·</span>
          <span>CDP Stream</span>
        </div>
      </div>
    </aside>
  );
}
