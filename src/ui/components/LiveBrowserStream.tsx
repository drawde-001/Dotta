import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  Folder,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown
} from 'lucide-react';

interface LiveBrowserStreamProps {
  streamState: BrowserStreamState;
  onSimulateUrlChange: (newUrl: string) => void;
  onManualNavigate: (url: string) => void;
  onRunAutonomousAgent?: () => void;
  isConnectedToBackend?: boolean;
  onSendWsMessage?: (msg: any) => void;
  onOpenFiles?: () => void;
}

export const LiveBrowserStream: React.FC<LiveBrowserStreamProps> = ({
  streamState,
  onManualNavigate,
  onSendWsMessage,
  onOpenFiles
}) => {
  const [inputUrl, setInputUrl] = useState(
    streamState.url === 'about:blank' ? '' : streamState.url
  );
  const [browserOpen, setBrowserOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastMoveRef = useRef<number>(0);

  useEffect(() => {
    if (streamState.url && streamState.url !== 'about:blank') {
      setInputUrl(streamState.url);
    }
    if (streamState.liveFrame) {
      setBrowserOpen(true);
    }
  }, [streamState.url, streamState.liveFrame]);

  // Non-passive wheel listener to allow smooth scrolling without outer page scroll
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onSendWsMessage) {
        onSendWsMessage({
          type: 'wheel',
          deltaX: Math.round(e.deltaX),
          deltaY: Math.round(e.deltaY)
        });
      }
    };

    el.addEventListener('wheel', onWheelHandler, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelHandler);
    };
  }, [onSendWsMessage, streamState.liveFrame]);

  const handleViewportClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !onSendWsMessage) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    onSendWsMessage({ type: 'click', x, y });
  };

  const handleViewportMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !onSendWsMessage) return;
    const now = Date.now();
    if (now - lastMoveRef.current < 50) return;
    lastMoveRef.current = now;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    onSendWsMessage({ type: 'move', x, y });
  };

  const handleScroll = (direction: 'up' | 'down' | 'top' | 'bottom', amount = 400) => {
    if (!onSendWsMessage) return;
    if (direction === 'top' || direction === 'bottom') {
      onSendWsMessage({ type: 'scroll', position: direction });
    } else {
      const deltaY = direction === 'up' ? -amount : amount;
      onSendWsMessage({ type: 'scroll', dy: deltaY, deltaY });
    }
  };

  const handleBack = () => {
    if (onSendWsMessage) onSendWsMessage({ type: 'back' });
  };

  const handleForward = () => {
    if (onSendWsMessage) onSendWsMessage({ type: 'forward' });
  };

  const handleReload = () => {
    if (onSendWsMessage) {
      onSendWsMessage({ type: 'reload' });
    } else if (inputUrl) {
      onManualNavigate(inputUrl);
    }
  };

  const handleViewportKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onSendWsMessage) return;
    if (
      e.key === 'Backspace' ||
      e.key === 'Enter' ||
      e.key === 'Tab' ||
      e.key === 'Escape' ||
      e.key.startsWith('Arrow')
    ) {
      e.preventDefault();
      onSendWsMessage({ type: 'press', key: e.key });
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
      onSendWsMessage({ type: 'type', text: e.key });
    }
  };

  // Minimalist Idle Workspace State (matching Screenshot 2)
  if (!browserOpen && !streamState.liveFrame) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          width: '100%',
          backgroundColor: 'var(--bg-app)',
          padding: '24px',
          gap: '10px',
          userSelect: 'none'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            width: '100%',
            maxWidth: '380px'
          }}
        >
          {/* Browser Button */}
          <button
            onClick={() => setBrowserOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s ease, border-color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
              e.currentTarget.style.borderColor = 'var(--border-medium)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Globe size={15} color="var(--text-secondary)" />
              <span>Browser</span>
            </div>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                backgroundColor: 'rgba(255,255,255,0.05)',
                padding: '2px 7px',
                borderRadius: '5px'
              }}
            >
              Ctrl+T
            </span>
          </button>

          {/* Files Button */}
          <button
            onClick={() => onOpenFiles && onOpenFiles()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s ease, border-color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
              e.currentTarget.style.borderColor = 'var(--border-medium)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Folder size={15} color="var(--text-secondary)" />
              <span>Files</span>
            </div>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                backgroundColor: 'rgba(255,255,255,0.05)',
                padding: '2px 7px',
                borderRadius: '5px'
              }}
            >
              Ctrl+P
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Active Minimal Browser View
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-app)',
        overflow: 'hidden'
      }}
    >
      {/* Clean Minimal Address Bar */}
      <div
        style={{
          height: '44px',
          padding: '0 12px',
          backgroundColor: 'var(--bg-app)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            onClick={handleBack}
            title="Back"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <ArrowLeft size={14} />
          </button>
          <button
            onClick={handleForward}
            title="Forward"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <ArrowRight size={14} />
          </button>
          <button
            onClick={handleReload}
            title="Reload page"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <RotateCw size={13} />
          </button>
        </div>

        {/* URL Input */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '5px 12px',
            fontSize: '12px'
          }}
        >
          <Globe size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={inputUrl}
            placeholder="Enter URL or search..."
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && inputUrl.trim() && onManualNavigate(inputUrl.trim())}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '12px',
              color: 'var(--text-primary)'
            }}
          />
        </div>

        {!streamState.liveFrame && (
          <button
            onClick={() => setBrowserOpen(false)}
            title="Close browser bar"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex'
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Viewport */}
      <div
        style={{
          flex: 1,
          backgroundColor: 'var(--bg-app)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '12px'
        }}
      >
        {streamState.liveFrame ? (
          <div
            ref={viewportRef}
            tabIndex={0}
            onKeyDown={handleViewportKeyDown}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              outline: 'none'
            }}
          >
            <img
              ref={imgRef}
              src={`data:image/jpeg;base64,${streamState.liveFrame}`}
              alt="Browser Viewport"
              onClick={handleViewportClick}
              onMouseMove={handleViewportMouseMove}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer'
              }}
            />

            {/* Interactive Scroll Controls Overlay */}
            <div
              style={{
                position: 'absolute',
                right: '18px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                backgroundColor: 'rgba(24, 24, 27, 0.88)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '4px',
                zIndex: 10,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); handleScroll('top'); }}
                title="Scroll to Top"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <ChevronsUp size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleScroll('up', 350); }}
                title="Scroll Up"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleScroll('down', 350); }}
                title="Scroll Down"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <ChevronDown size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleScroll('bottom'); }}
                title="Scroll to Bottom"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <ChevronsDown size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              color: 'var(--text-muted)',
              fontSize: '13px'
            }}
          >
            <Globe size={24} strokeWidth={1.5} />
            <span>Type a URL above and press Enter to browse</span>
          </div>
        )}
      </div>
    </div>
  );
};
