import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Bot, BrainCircuit, ChevronDown, ChevronRight, Plus, Sparkles, Terminal } from 'lucide-react';
import { ToolCallCard } from './components/ToolCallCard.jsx';
import { MarkdownRenderer } from './components/MarkdownRenderer.jsx';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [expandedThoughts, setExpandedThoughts] = useState({});
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const toggleThought = (idx) => {
    setExpandedThoughts((prev) => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const handleNewChat = () => {
    if (isRunning) return;
    setMessages([]);
    setInput('');
    setError(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isRunning) return;

    const userText = input.trim();
    setInput('');
    setError(null);

    const userMessage = { role: 'user', content: userText };
    const assistantIndex = messages.length + 1;
    const assistantMessage = {
      role: 'assistant',
      content: '',
      thought: '',
      tools: []
    };

    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    setIsRunning(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: userText,
          messages: [...messages, userMessage],
          model: 'meta-muse-spark'
        })
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

              if (event.type === 'TEXT_CHUNK' && event.chunk) {
                last.content = (last.content || '') + event.chunk;
              } else if (event.type === 'THOUGHT_CHUNK' && event.chunk) {
                last.thought = (last.thought || '') + event.chunk;
              } else if (event.type === 'TOOL_CALL') {
                last.tools = [
                  ...(last.tools || []),
                  { id: event.id, name: event.name, args: event.args, status: 'running' }
                ];
              } else if (event.type === 'TOOL_RESULT') {
                last.tools = (last.tools || []).map((t) =>
                  t.id === event.id || (!t.output && t.name === event.name)
                    ? { ...t, output: event.output, status: event.status }
                    : t
                );
              }

              updated[updated.length - 1] = last;
              return updated;
            });
          } catch {}
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0d0d0e] text-zinc-100 font-sans selection:bg-zinc-800">
      {/* Top Bar */}
      <header className="h-13 border-b border-zinc-800/80 px-6 flex items-center justify-between shrink-0 bg-[#0d0d0e]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-zinc-200" />
          </div>
          <span className="font-medium text-sm text-zinc-100 tracking-tight">Omni Agent</span>
          <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md">
            meta-muse-spark
          </span>
        </div>

        <button
          onClick={handleNewChat}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1.5 rounded-lg transition"
          title="Start new thread"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Chat</span>
        </button>
      </header>

      {/* Main Messages Viewport */}
      <main className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="py-24 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-300 shadow-sm">
                <Sparkles className="w-6 h-6 text-zinc-400" />
              </div>
              <h2 className="text-lg font-medium text-zinc-200">How can Omni help you today?</h2>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Equipped with live web search, file workspace editing, and sandboxed execution powered by Meta Muse.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={idx}
                className={`flex gap-3 text-sm ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                )}

                <div className={`space-y-2 ${isUser ? 'max-w-[80%]' : 'flex-1 min-w-0'}`}>
                  {/* User message pill */}
                  {isUser && (
                    <div className="bg-zinc-800 text-zinc-100 rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm">
                      {msg.content}
                    </div>
                  )}

                  {/* Assistant response */}
                  {!isUser && (
                    <div className="space-y-3">
                      {/* Collapsible Reasoning Block */}
                      {msg.thought && (
                        <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/30">
                          <button
                            type="button"
                            onClick={() => toggleThought(idx)}
                            className="w-full px-3 py-2 flex items-center justify-between text-left text-xs text-zinc-400 hover:text-zinc-300 transition"
                          >
                            <span className="flex items-center gap-1.5 font-mono text-[11px]">
                              <BrainCircuit className="w-3.5 h-3.5 text-zinc-400" />
                              Reasoning
                            </span>
                            {expandedThoughts[idx] ? (
                              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                            )}
                          </button>
                          {expandedThoughts[idx] && (
                            <div className="p-3 border-t border-zinc-800/60 bg-zinc-950/40 font-mono text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
                              {msg.thought}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tool Calls */}
                      {msg.tools && msg.tools.length > 0 && (
                        <div className="space-y-1">
                          {msg.tools.map((tool, tIdx) => (
                            <ToolCallCard
                              key={tIdx}
                              name={tool.name}
                              args={tool.args}
                              output={tool.output}
                              status={tool.status}
                            />
                          ))}
                        </div>
                      )}

                      {/* Text Markdown Output */}
                      {msg.content && <MarkdownRenderer content={msg.content} />}

                      {/* Streaming cursor if empty and running */}
                      {isRunning && idx === messages.length - 1 && !msg.content && (!msg.tools || msg.tools.length === 0) && (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500 py-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                          <span>Omni is working...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-red-300 text-xs">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Floating Bottom Composer */}
      <footer className="p-4 shrink-0 bg-gradient-to-t from-[#0d0d0e] via-[#0d0d0e] to-transparent">
        <div className="max-w-2xl mx-auto">
          <div className="border border-zinc-800/90 hover:border-zinc-700/80 focus-within:border-zinc-700 bg-zinc-900/80 backdrop-blur-md rounded-2xl p-2 shadow-2xl transition">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              disabled={isRunning}
              className="w-full bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none disabled:opacity-50 max-h-48"
            />

            <div className="flex items-center justify-between pt-1 px-1 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                <span>Meta Muse Core</span>
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={isRunning || !input.trim()}
                className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-30 disabled:hover:bg-zinc-100 flex items-center justify-center transition shadow-sm"
                title="Send message"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
          <div className="text-[10px] text-center text-zinc-600 mt-2">
            Omni Agent can run tools autonomously. Review sensitive actions.
          </div>
        </div>
      </footer>
    </div>
  );
}
