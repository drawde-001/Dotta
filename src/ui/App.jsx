import React, { useState, useRef } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useExternalMessageConverter
} from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { LiveBrowserSidebar } from '@/components/LiveBrowserSidebar';
import { Sparkles, Globe, Plus, PanelRight } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [browserState, setBrowserState] = useState({
    url: '',
    title: '',
    results: [],
    content: ''
  });

  const abortControllerRef = useRef(null);

  const handleNewChat = () => {
    if (isRunning) return;
    setMessages([]);
    setBrowserState({ url: '', title: '', results: [], content: '' });
  };

  const handleSendMessage = async (userMessage) => {
    let userText = '';
    if (typeof userMessage === 'string') {
      userText = userMessage;
    } else if (Array.isArray(userMessage?.content)) {
      userText = userMessage.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
    } else if (typeof userMessage?.content === 'string') {
      userText = userMessage.content;
    }

    if (!userText.trim() || isRunning) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    const newMessages = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        content: [{ type: 'text', text: userText }]
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: []
      }
    ];

    setMessages(newMessages);
    setIsRunning(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: userText,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content
              .filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('')
          })),
          model: 'meta-muse-spark'
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            setMessages((prev) => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };
              const contentParts = [...(last.content || [])];

              if (event.type === 'TEXT_CHUNK' && event.chunk) {
                const textPartIdx = contentParts.findIndex((c) => c.type === 'text');
                if (textPartIdx >= 0) {
                  contentParts[textPartIdx] = {
                    ...contentParts[textPartIdx],
                    text: contentParts[textPartIdx].text + event.chunk
                  };
                } else {
                  contentParts.push({ type: 'text', text: event.chunk });
                }
              } else if (event.type === 'THOUGHT_CHUNK' && event.chunk) {
                const rPartIdx = contentParts.findIndex((c) => c.type === 'reasoning');
                if (rPartIdx >= 0) {
                  contentParts[rPartIdx] = {
                    ...contentParts[rPartIdx],
                    text: contentParts[rPartIdx].text + event.chunk
                  };
                } else {
                  contentParts.unshift({ type: 'reasoning', text: event.chunk });
                }
              } else if (event.type === 'TOOL_CALL') {
                contentParts.push({
                  type: 'tool-call',
                  toolCallId: event.id,
                  toolName: event.name,
                  args: event.args,
                  status: { type: 'running' }
                });

                // Update browser sidebar if browser tool
                if (event.name === 'browser_search' || event.name === 'web_search') {
                  setIsBrowserOpen(true);
                  setBrowserState((bs) => ({
                    ...bs,
                    url: `https://duckduckgo.com/?q=${encodeURIComponent(event.args?.query || '')}`,
                    title: `Search: "${event.args?.query || ''}"`
                  }));
                } else if (event.name === 'browser_read_page' || event.name === 'read_page') {
                  setIsBrowserOpen(true);
                  setBrowserState((bs) => ({
                    ...bs,
                    url: event.args?.url || bs.url,
                    title: `Navigating: ${event.args?.url || ''}`
                  }));
                }
              } else if (event.type === 'TOOL_RESULT') {
                const tcIdx = contentParts.findIndex(
                  (c) => c.type === 'tool-call' && (c.toolCallId === event.id || c.toolName === event.name)
                );
                if (tcIdx >= 0) {
                  contentParts[tcIdx] = {
                    ...contentParts[tcIdx],
                    result: event.output,
                    status: { type: 'complete' }
                  };
                }

                // Update browser sidebar with discovered output
                if (event.name === 'browser_search' || event.name === 'web_search') {
                  setBrowserState((bs) => ({
                    ...bs,
                    content: event.output
                  }));
                }
              }

              last.content = contentParts;
              updated[updated.length - 1] = last;
              return updated;
            });
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Chat stream error:', err);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsRunning(false);
    }
  };

  const threadMessages = useExternalMessageConverter({
    messages,
    isRunning,
    callback: (msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content
    })
  });

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages: threadMessages,
    onNew: async (msg) => {
      await handleSendMessage(msg);
    },
    onCancel: async () => {
      handleCancel();
    }
  });

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Main Workspace Area (Left / Center) */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Header Bar */}
        <header className="h-13 border-b border-border/80 px-5 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-zinc-200" />
            </div>
            <span className="font-medium text-sm text-foreground tracking-tight">Omni Agent</span>
            <span className="text-[11px] font-mono text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-md">
              meta-muse-spark
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Browser Sidebar Toggle */}
            <button
              type="button"
              onClick={() => setIsBrowserOpen(!isBrowserOpen)}
              className={`flex items-center gap-1.5 text-xs border px-2.5 py-1.5 rounded-lg transition ${
                isBrowserOpen
                  ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                  : 'bg-muted text-muted-foreground hover:text-foreground border-border hover:bg-zinc-800'
              }`}
              title="Toggle Browser Sidebar"
            >
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>Browser</span>
            </button>

            {/* New Chat Button */}
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-zinc-800 border border-border px-2.5 py-1.5 rounded-lg transition"
              title="New Chat"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>
        </header>

        {/* Assistant-UI Thread Viewport */}
        <div className="flex-1 overflow-hidden relative">
          <AssistantRuntimeProvider runtime={runtime}>
            <Thread />
          </AssistantRuntimeProvider>
        </div>
      </div>

      {/* Right Browser Sidebar */}
      <LiveBrowserSidebar
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        browserState={browserState}
        onNavigate={(url) => {
          setBrowserState((bs) => ({ ...bs, url }));
        }}
      />
    </div>
  );
}
