import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useExternalMessageConverter
} from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { InputDock } from '@/components/InputDock';
import { LiveBrowserStream } from '@/components/LiveBrowserStream';
import {
  Globe,
  PenLine,
  FileSpreadsheet,
  Laptop,
  Briefcase,
  Columns,
  Zap,
  Shuffle,
  PanelRight,
  Plus
} from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState('chat');
  const [agentMode, setAgentMode] = useState('turbo');
  const [activeInterrupt, setActiveInterrupt] = useState(null);
  const [selectedModel, setSelectedModel] = useState('muse-spark-1.3');
  const [actionSetIndex, setActionSetIndex] = useState(0);

  // Dynamic rotating subtitles for Hero screen
  const heroSubtitles = [
    'Automate forms, extract structured data, and compare live prices.',
    'Where should we start? — Apply to jobs, fill applications, or automate workflows.',
    'Autonomously apply to high-fit engineering roles using your candidate profile.',
    'Find open positions, tailor candidate details, and submit applications.'
  ];
  const [subtitleIndex, setSubtitleIndex] = useState(0);

  // Live browser stream state
  const [streamState, setStreamState] = useState({
    url: 'https://duckduckgo.com',
    title: 'OmniAgent Browser Viewport — Ready',
    isLoading: false,
    isLiveStreaming: true,
    fps: 60,
    cursor: { x: 50, y: 50, isClicking: false },
    currentAction: 'Idle — Ready for task',
    currentStep: 0,
    totalSteps: 0,
    interactiveElements: [],
    discoveredEndpoints: [],
    liveFrame: null
  });

  const abortControllerRef = useRef(null);
  const wsRef = useRef(null);

  // Connect WebSocket to backend stream
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;

    function connect() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        ws = new WebSocket(`${protocol}//${host}/ws`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'frame' && data.data) {
              setStreamState((prev) => ({
                ...prev,
                liveFrame: data.data,
                url: data.url && data.url !== 'about:blank' ? data.url : prev.url
              }));
            } else if (data.type === 'init' && data.url) {
              setStreamState((prev) => ({
                ...prev,
                url: data.url
              }));
            } else if (data.type === 'navigated' && data.url) {
              setStreamState((prev) => ({
                ...prev,
                url: data.url,
                title: data.title || prev.title
              }));
            }
          } catch {}
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 2000);
        };

        ws.onerror = () => {};
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const handleSendWsMessage = (msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  // Subtitle rotation
  useEffect(() => {
    if (messages.length > 0) return;
    const interval = setInterval(() => {
      setSubtitleIndex((prev) => (prev + 1) % heroSubtitles.length);
    }, 120000);
    return () => clearInterval(interval);
  }, [messages.length, heroSubtitles.length]);

  const quickActionSets = [
    [
      { label: 'Build a website', icon: <Globe size={13} /> },
      { label: 'Fill a demo form', icon: <PenLine size={13} /> },
      { label: 'Export partners to CSV', icon: <FileSpreadsheet size={13} /> },
      { label: 'Compare laptop prices', icon: <Laptop size={13} /> },
    ],
    [
      { label: 'Apply to this job', icon: <Briefcase size={13} /> },
      { label: 'Fill this application', icon: <PenLine size={13} /> },
      { label: 'Find engineering jobs', icon: <Globe size={13} /> },
      { label: 'Map contact form fields', icon: <Columns size={13} /> },
    ],
    [
      { label: 'Search remote engineering roles', icon: <Briefcase size={13} /> },
      { label: 'Review tailored cover letter', icon: <PenLine size={13} /> },
      { label: 'Autofill application form', icon: <PenLine size={13} /> },
      { label: 'Automate job search workflow', icon: <Zap size={13} /> },
    ]
  ];

  const activeQuickActions = quickActionSets[actionSetIndex % quickActionSets.length];

  const handleShuffleQuickActions = () => {
    setActionSetIndex((prev) => (prev + 1) % quickActionSets.length);
  };

  const handleNewChat = () => {
    if (isRunning) return;
    setMessages([]);
    setActiveInterrupt(null);
  };

  const handleSendMessage = async (userMessage, options = {}) => {
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
        content: [{ type: 'text', text: '' }]
      }
    ];

    setMessages(newMessages);
    setIsRunning(true);

    // Auto-open workspace when URL is in prompt
    const urlMatch = userText.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      setWorkspaceMode('work');
    }

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
          model: selectedModel,
          mode: agentMode,
          resume: options.resume || null
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

            if (event.type === 'INTERRUPT') {
              setActiveInterrupt({
                id: event.id || `interrupt-${Date.now()}`,
                reason: event.reason,
                message: event.question || event.message || 'Permission or input required to proceed:',
                metadata: {
                  toolName: event.tool || event.pendingTool,
                  toolArgs: event.args || {},
                  options: event.options,
                  context: event.context,
                  questions: event.questions
                }
              });
              continue;
            }

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
                  toolCallId: event.id || `call-${Date.now()}`,
                  toolName: event.name,
                  args: event.args || {},
                  argsText: JSON.stringify(event.args || {})
                });

                // Update or create Plan trajectory as DataMessagePart
                const stepTitle = event.args?.stepTitle || event.name;
                const newStep = {
                  id: event.id || `step-${Date.now()}`,
                  title: stepTitle,
                  description:
                    event.args?.query ||
                    event.args?.url ||
                    event.args?.command ||
                    event.args?.selectorOrText ||
                    '',
                  status: 'running'
                };
                const planIdx = contentParts.findIndex((c) => c.type === 'data' && c.name === 'plan');
                if (planIdx >= 0) {
                  const existingSteps = contentParts[planIdx].data?.steps || [];
                  contentParts[planIdx] = {
                    type: 'data',
                    name: 'plan',
                    data: {
                      title: 'Agent Trajectory',
                      status: 'running',
                      steps: [...existingSteps, newStep]
                    }
                  };
                } else {
                  contentParts.unshift({
                    type: 'data',
                    name: 'plan',
                    data: {
                      title: 'Agent Trajectory',
                      status: 'running',
                      steps: [newStep]
                    }
                  });
                }

                // Auto-open live browser when browser tool runs
                if (
                  event.name.startsWith('browser_') ||
                  event.name.startsWith('snapshot_') ||
                  event.name === 'web_search' ||
                  event.name === 'read_page'
                ) {
                  setWorkspaceMode('work');
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

                // Update Plan trajectory step status
                const planIdx = contentParts.findIndex((c) => c.type === 'data' && c.name === 'plan');
                if (planIdx >= 0 && contentParts[planIdx].data?.steps) {
                  const updatedSteps = contentParts[planIdx].data.steps.map((s) => {
                    if (s.id === event.id || s.title === (event.name || event.args?.stepTitle)) {
                      return { ...s, status: event.status === 'error' ? 'failed' : 'done' };
                    }
                    return s;
                  });
                  const allDone = updatedSteps.every((s) => s.status === 'done');
                  contentParts[planIdx] = {
                    type: 'data',
                    name: 'plan',
                    data: {
                      title: 'Agent Trajectory',
                      status: allDone ? 'done' : 'running',
                      steps: updatedSteps
                    }
                  };
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

  const handleResolveInterrupt = async (interrupt, payload) => {
    setActiveInterrupt(null);
    if (!interrupt) return;

    const answerText = payload?.answer || (payload?.approved ? 'Approved' : 'Denied');
    await handleSendMessage(answerText, {
      resume: {
        toolName: interrupt.metadata?.toolName,
        approved: payload?.approved,
        answer: payload?.answer,
        customText: payload?.customText,
        chosenOptions: payload?.chosenOptions
      }
    });
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
    <div className="flex flex-col h-screen w-screen bg-[#08080A] text-foreground font-sans overflow-hidden select-none">
      {/* Top Header Bar */}
      <header className="h-11 px-4 flex items-center justify-between shrink-0 bg-[#08080A] border-b border-[#1F1F26] z-30">
        {/* Left: Brand */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-white tracking-tight">OmniAgent</span>
        </div>

        {/* Center: Chat | Work Switcher */}
        <div className="flex items-center bg-[#18181E] border border-[#2C2C35] rounded-full p-0.5 gap-1">
          <button
            type="button"
            onClick={() => setWorkspaceMode('chat')}
            className={`px-3.5 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
              workspaceMode === 'chat'
                ? 'bg-white/12 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode('work')}
            className={`px-3.5 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
              workspaceMode === 'work'
                ? 'bg-white/12 text-white font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Work
          </button>
        </div>

        {/* Right: Workspace Toggle Button & New Chat */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleNewChat}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title="New Conversation"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode(workspaceMode === 'chat' ? 'work' : 'chat')}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title={workspaceMode === 'chat' ? 'Open workspace panel' : 'Hide workspace panel'}
          >
            <PanelRight size={15} />
          </button>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Chat Panel (Left / Full) */}
        <div
          className={`flex flex-col h-full overflow-hidden relative transition-all duration-200 ${
            workspaceMode === 'work' ? 'flex-1 border-r border-[#1F1F26]' : 'w-full'
          }`}
        >
          {messages.length === 0 ? (
            /* Centered Hero View */
            <div className="flex-1 flex flex-col items-center justify-center p-6 select-none relative z-10 max-w-2xl mx-auto w-full">
              <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-2 text-center">
                OmniAgent
              </h1>
              <p className="text-sm sm:text-base text-zinc-400 max-w-lg mb-8 text-center">
                {heroSubtitles[subtitleIndex]}
              </p>

              {/* Exact Chatbox in Hero Mode */}
              <div className="w-full">
                <InputDock
                  heroMode={true}
                  maxWidth="596px"
                  onSendMessage={handleSendMessage}
                  isWorking={isRunning}
                  onStopWorking={handleCancel}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  mode={agentMode}
                  onChangeMode={setAgentMode}
                  activeInterrupt={activeInterrupt}
                  onResolveInterrupt={handleResolveInterrupt}
                />
              </div>

              {/* Curated Suggestion Chips */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4 max-w-xl">
                {activeQuickActions.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(chip.label)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/[0.08] bg-[#18181c]/80 hover:bg-[#222228] text-zinc-300 hover:text-white transition cursor-pointer"
                  >
                    <span className="text-zinc-400">{chip.icon}</span>
                    <span>{chip.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleShuffleQuickActions}
                  className="p-1.5 rounded-full border border-white/[0.08] bg-[#18181c]/80 hover:bg-[#222228] text-zinc-400 hover:text-white transition cursor-pointer"
                  title="Shuffle suggestions"
                >
                  <Shuffle size={13} />
                </button>
              </div>
            </div>
          ) : (
            /* Active Message Thread with Bottom Docked InputDock */
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
              <div className="flex-1 overflow-y-auto">
                <AssistantRuntimeProvider runtime={runtime}>
                  <Thread
                    activeInterrupt={activeInterrupt}
                    onResolveInterrupt={handleResolveInterrupt}
                    selectedModel={selectedModel}
                    onSelectModel={setSelectedModel}
                  />
                </AssistantRuntimeProvider>
              </div>

              {/* Bottom Docked Composer */}
              <div className="shrink-0 p-3 bg-[#08080A] border-t border-[#1F1F26] max-w-3xl w-full mx-auto">
                <InputDock
                  heroMode={false}
                  maxWidth="100%"
                  onSendMessage={handleSendMessage}
                  isWorking={isRunning}
                  onStopWorking={handleCancel}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  mode={agentMode}
                  onChangeMode={setAgentMode}
                  activeInterrupt={activeInterrupt}
                  onResolveInterrupt={handleResolveInterrupt}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Minimal Workspace Panel (Shown in Work mode) */}
        {workspaceMode === 'work' && (
          <div className="flex-1 flex flex-col min-w-[360px] max-w-[50%] h-full bg-[#08080A] relative overflow-hidden">
            {/* Dedicated Top Bar for Close Workspace Button */}
            <div className="h-10 px-3.5 flex items-center justify-end shrink-0 bg-[#08080A]">
              <button
                type="button"
                onClick={() => setWorkspaceMode('chat')}
                title="Hide workspace panel"
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                <PanelRight size={15} />
              </button>
            </div>

            {/* Minimal Browser Stream Frame */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <LiveBrowserStream
                streamState={streamState}
                onSimulateUrlChange={(newUrl) =>
                  setStreamState((prev) => ({ ...prev, url: newUrl }))
                }
                onManualNavigate={(targetUrl) =>
                  handleSendMessage(`Navigate to ${targetUrl}`)
                }
                onSendWsMessage={handleSendWsMessage}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
