import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, AlertCircle } from 'lucide-react';
import { ToolCallCard } from './components/ToolCallCard.jsx';

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello Eddy! I am Omni Agent, powered by Meta Muse. How can I help you today?',
      tools: []
    }
  ]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;

    const userText = input.trim();
    setInput('');
    setError(null);

    const userMessage = { role: 'user', content: userText };
    const assistantMessage = { role: 'assistant', content: '', thought: '', tools: [] };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
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
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Top Navigation */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h1 className="font-semibold text-sm tracking-wide">Omni Agent</h1>
          <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
            Meta Muse
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Core Ready
          </span>
        </div>
      </header>

      {/* Chat Thread */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl w-full mx-auto space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
            )}
            <div
              className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-zinc-900 border border-zinc-800/80 text-zinc-200'
              }`}
            >
              {/* Internal Thought Block */}
              {msg.thought && (
                <div className="mb-3 text-xs italic text-zinc-400 bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/60 font-mono">
                  <div className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Thought Process:</div>
                  {msg.thought}
                </div>
              )}

              {/* Tool Executions */}
              {msg.tools && msg.tools.length > 0 && (
                <div className="my-2 space-y-1">
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

              {/* Response Text */}
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-zinc-300" />
              </div>
            )}
          </div>
        ))}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Bar */}
      <footer className="p-4 border-t border-zinc-800 bg-zinc-900/30">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRunning ? 'Omni is thinking...' : 'Send a message or give an instruction...'}
            disabled={isRunning}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isRunning || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl px-4 py-3 font-medium transition flex items-center gap-1.5 text-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>
    </div>
  );
}
