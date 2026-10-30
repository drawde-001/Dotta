import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useExternalMessageConverter
} from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { InputDock } from '@/components/InputDock';
import { ThreadListSidebar } from '@/components/assistant-ui/elements/threadlist-sidebar.aui';
import { WorkspacePanel } from '@/components/WorkspacePanel';
import { AppRail } from '@/components/AppRail';
import { BioDashboard } from '@/components/BioDashboard';
import { AgentChatCard } from '@/components/AgentChatCard';
import {
  Globe,
  PenLine,
  FileSpreadsheet,
  Laptop,
  Briefcase,
  Columns,
  Zap,
  Shuffle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen
} from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState('chat');
  const [agentMode, setAgentMode] = useState('turbo');
  const [activeInterrupt, setActiveInterrupt] = useState(null);
  const [selectedModel, setSelectedModel] = useState('muse-spark-1.3');
  const [actionSetIndex, setActionSetIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState('home');
  const [openFiles, setOpenFiles] = useState([]);
  const [activeTabId, setActiveTabId] = useState('plus');

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
  const browserIdleTimerRef = useRef(null);
  const currentThreadIdRef = useRef(`thread-${Date.now()}`);

  const handleOpenFileTab = (fileData) => {
    if (!fileData) return;
    const fileId = fileData.id || fileData.path || fileData.name || `file-${Date.now()}`;
    setOpenFiles((prev) => {
      const exists = prev.find((f) => (f.id || f.path || f.name) === fileId);
      if (exists) return prev;
      return [...prev, { ...fileData, id: fileId }];
    });
    setActiveTabId(fileId);
    setWorkspaceMode('work');
  };

  const handleCloseFileTab = (fileId) => {
    setOpenFiles((prev) => prev.filter((f) => (f.id || f.path || f.name) !== fileId));
    if (activeTabId === fileId) {
      setActiveTabId('browser');
    }
  };

  // Listen for open file events from FileSystemArtifact in chat
  useEffect(() => {
    const handleOpenFile = (event) => {
      if (event.detail) {
        handleOpenFileTab(event.detail);
      }
    };
    window.addEventListener('omni:open-file', handleOpenFile);
    return () => window.removeEventListener('omni:open-file', handleOpenFile);
  }, []);

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
            } else if (data.type === 'browser_closed') {
              console.log('[App] Headless browser closed on server. Resetting workspace to chat.');
              setWorkspaceMode('chat');
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
    currentThreadIdRef.current = `thread-${Date.now()}`;
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

    const rawAttachments = options.attachments || [];
    const orderedAttachments = rawAttachments.map((att, idx) => ({
      ...att,
      order: att.order || idx + 1
    }));

    if ((!userText.trim() && orderedAttachments.length === 0) || (!options.isResume && isRunning)) return;

    // Reset browser idle timer when user initiates new generation
    if (browserIdleTimerRef.current) {
      clearTimeout(browserIdleTimerRef.current);
      browserIdleTimerRef.current = null;
    }

    // Process attachments sequentially in the background if attachments are present
    let attachmentSystemContext = '';
    if (orderedAttachments.length > 0) {
      try {
        const attRes = await fetch('/api/attachments/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attachments: orderedAttachments })
        });
        if (attRes.ok) {
          const attData = await attRes.json();
          attachmentSystemContext = attData.contextPrompt || '';
        }
      } catch (err) {
        console.warn('[Attachments] Background sequential processing error:', err);
      }
    }

    const now = Date.now();
    const userMsgId = `user-${now}`;
    const assistantMsgId = `asst-${now}`;

    let newMessages;
    if (options.baseMessages) {
      newMessages = options.baseMessages;
    } else if (options.isResume) {
      newMessages = messages.map((m, idx) => {
        if (idx === messages.length - 1 && m.role === 'assistant') {
          return {
            ...m,
            runStatus: 'running'
          };
        }
        return m;
      });
    } else {
      newMessages = [
        ...messages,
        {
          id: userMsgId,
          role: 'user',
          content: [{ type: 'text', text: userText || (orderedAttachments.length ? `[${orderedAttachments.length} attachments]` : '') }],
          attachments: orderedAttachments
        },
        {
          id: assistantMsgId,
          role: 'assistant',
          content: [],
          runStartedAt: now,
          runCompletedAt: null,
          runStatus: 'running'
        }
      ];
    }

    setMessages(newMessages);
    setIsRunning(true);

    // Auto-open workspace when URL is in prompt
    const urlMatch = userText.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      setWorkspaceMode('work');
      setActiveTabId('browser');
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const chatInstruction = attachmentSystemContext
      ? `${userText ? userText + '\n\n' : ''}[System: ${attachmentSystemContext}]`
      : userText;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: currentThreadIdRef.current,
          instruction: chatInstruction,
          messages: newMessages
            .filter((m) => m.id !== assistantMsgId)
            .map((m) => ({
              role: m.role,
              content: (m.content || [])
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n')
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
              setActiveInterrupt((prev) => {
                const args =
                  event.args && Object.keys(event.args).length > 0
                    ? event.args
                    : prev?.metadata?.toolArgs || {};
                const rawQuestion =
                  event.question ||
                  args.question ||
                  args.prompt ||
                  args.message ||
                  args.title ||
                  event.message ||
                  prev?.message ||
                  'Which option would you prefer?';
                const candidateOpts =
                  (Array.isArray(event.options) && event.options.length > 0 ? event.options : null) ||
                  (Array.isArray(args.options) && args.options.length > 0 ? args.options : null) ||
                  (Array.isArray(args.choices) && args.choices.length > 0 ? args.choices : null) ||
                  prev?.metadata?.options ||
                  [];
                return {
                  id: event.id || prev?.id || `interrupt-${Date.now()}`,
                  reason: event.reason || prev?.reason || 'user_question',
                  message: rawQuestion,
                  metadata: {
                    toolName: event.tool || event.pendingTool || prev?.metadata?.toolName,
                    toolArgs: args,
                    options: candidateOpts.slice(0, 3),
                    context: event.context || args.context || prev?.metadata?.context,
                    questions: event.questions || args.questions || prev?.metadata?.questions
                  }
                };
              });
              setMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                last.runStatus = 'requires-action';
                updated[updated.length - 1] = last;
                return updated;
              });
              continue;
            }

            setMessages((prev) => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };
              const contentParts = [...(last.content || [])];

              const settleReasoning = () => {
                for (let i = 0; i < contentParts.length; i++) {
                  if (contentParts[i].type === 'reasoning' && contentParts[i].status?.type === 'running') {
                    contentParts[i] = {
                      ...contentParts[i],
                      status: { type: 'complete' }
                    };
                  }
                }
              };

              if (event.type === 'TEXT_CHUNK' && event.chunk) {
                settleReasoning();
                const lastPart = contentParts[contentParts.length - 1];
                if (lastPart && lastPart.type === 'text') {
                  contentParts[contentParts.length - 1] = {
                    ...lastPart,
                    text: lastPart.text + event.chunk
                  };
                } else {
                  contentParts.push({
                    type: 'text',
                    id: `text-${contentParts.length}`,
                    text: event.chunk
                  });
                }
              } else if (event.type === 'THOUGHT_CHUNK' && event.chunk) {
                const lastPart = contentParts[contentParts.length - 1];
                if (lastPart && lastPart.type === 'reasoning') {
                  contentParts[contentParts.length - 1] = {
                    ...lastPart,
                    text: lastPart.text + event.chunk,
                    status: { type: 'running' }
                  };
                } else {
                  contentParts.push({
                    type: 'reasoning',
                    id: `reasoning-${contentParts.length}`,
                    text: event.chunk,
                    status: { type: 'running' }
                  });
                }
              } else if (event.type === 'TOOL_CALL') {
                settleReasoning();
                contentParts.push({
                  type: 'tool-call',
                  toolCallId: event.id || `call-${Date.now()}-${contentParts.length}`,
                  toolName: event.name,
                  args: event.args || {},
                  argsText: JSON.stringify(event.args || {}),
                  status: { type: 'running' },
                  startedAt: Date.now()
                });

                // Auto-open live browser only when interactive browser tools run (not background web_search)
                if (
                  event.name.startsWith('browser_') ||
                  event.name.startsWith('snapshot_')
                ) {
                  setWorkspaceMode('work');
                  setActiveTabId('browser');
                }
              } else if (event.type === 'TOOL_RESULT') {
                let tcIdx = -1;
                for (let i = contentParts.length - 1; i >= 0; i--) {
                  const c = contentParts[i];
                  if (
                    c.type === 'tool-call' &&
                    (c.toolCallId === event.id ||
                      (c.toolName === event.name && c.status?.type === 'running'))
                  ) {
                    tcIdx = i;
                    break;
                  }
                }
                if (tcIdx === -1) {
                  tcIdx = contentParts.findIndex(
                    (c) =>
                      c.type === 'tool-call' &&
                      (c.toolCallId === event.id || c.toolName === event.name)
                  );
                }
                if (tcIdx >= 0) {
                  const startedAt = contentParts[tcIdx].startedAt;
                  contentParts[tcIdx] = {
                    ...contentParts[tcIdx],
                    result: event.output,
                    fileArtifact: event.fileArtifact || contentParts[tcIdx].fileArtifact,
                    elapsedMs: startedAt ? Date.now() - startedAt : undefined,
                    status: {
                      type: event.status === 'error' ? 'incomplete' : 'complete',
                      reason: event.status === 'error' ? 'error' : undefined
                    }
                  };
                }
              } else if (event.type === 'RUN_FINISHED') {
                settleReasoning();
                last.runCompletedAt = Date.now();
                last.runStatus = 'complete';

                // End of run: kill browser instance after 30s
                if (browserIdleTimerRef.current) {
                  clearTimeout(browserIdleTimerRef.current);
                }
                browserIdleTimerRef.current = setTimeout(() => {
                  console.log('[App] 30s reached after run. Killing live browser instance...');
                  setWorkspaceMode('chat');
                  handleSendWsMessage({ type: 'close_browser' });
                  fetch('/api/browser/close', { method: 'POST' }).catch(() => {});
                }, 30000);
              } else if (event.type === 'RUN_ERROR') {
                settleReasoning();
                last.runCompletedAt = Date.now();
                last.runStatus = 'error';
              }

              last.content = contentParts;
              updated[updated.length - 1] = last;
              return updated;
            });
          } catch {}
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev];
          const last = { ...updated[updated.length - 1] };
          if (last && last.role === 'assistant') {
            last.runCompletedAt = last.runCompletedAt || Date.now();
            last.runStatus = 'cancelled';
            updated[updated.length - 1] = last;
          }
          return updated;
        });
      } else {
        console.error('Chat stream error:', err);
        setMessages((prev) => {
          const updated = [...prev];
          const last = { ...updated[updated.length - 1] };
          if (last && last.role === 'assistant') {
            last.runCompletedAt = last.runCompletedAt || Date.now();
            last.runStatus = 'error';
            updated[updated.length - 1] = last;
          }
          return updated;
        });
      }
    } finally {
      setMessages((prev) => {
        const updated = [...prev];
        const last = { ...updated[updated.length - 1] };
        if (last && last.role === 'assistant') {
          last.runCompletedAt = last.runCompletedAt || Date.now();
          if (last.runStatus === 'running') {
            last.runStatus = 'complete';
          }
          last.content = (last.content || []).map((p) => {
            if (p.type === 'reasoning' && p.status?.type === 'running') {
              return { ...p, status: { type: 'complete' } };
            }
            if (p.type === 'tool-call' && p.status?.type === 'running') {
              return {
                ...p,
                status: {
                  type: last.runStatus === 'cancelled' ? 'incomplete' : 'complete',
                  reason: last.runStatus === 'cancelled' ? 'cancelled' : undefined
                }
              };
            }
            return p;
          });
          updated[updated.length - 1] = last;
        }
        return updated;
      });
      setIsRunning(false);
    }
  };

  const handleResolveInterrupt = async (interrupt, payload) => {
    setActiveInterrupt(null);
    if (!interrupt) return;

    const answerText = payload?.answer || (payload?.approved ? 'Approved' : 'Denied');
    const questionsAndAnswers = payload?.questionsAndAnswers || [
      {
        question: interrupt.message || 'Question',
        answer: answerText
      }
    ];

    const qaPart = {
      type: 'data-submitted-ask-user',
      id: `submitted-qa-${Date.now()}`,
      data: { questions: questionsAndAnswers },
      questions: questionsAndAnswers
    };

    // Prepend the Submitted QA Card directly into the assistant message in thread (Screenshot 1)
    let hasAssistant = false;
    const nextMessages = messages.map((m, idx) => {
      if (idx === messages.length - 1 && m.role === 'assistant') {
        hasAssistant = true;
        const existingParts = Array.isArray(m.content) ? [...m.content] : [];
        return {
          ...m,
          content: [...existingParts, qaPart],
          runStatus: 'running'
        };
      }
      return m;
    });

    if (!hasAssistant) {
      nextMessages.push({
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: [qaPart],
        runStartedAt: Date.now(),
        runCompletedAt: null,
        runStatus: 'running'
      });
    }

    setMessages(nextMessages);

    await handleSendMessage(answerText, {
      isResume: true,
      baseMessages: nextMessages,
      resume: {
        toolName: interrupt.metadata?.toolName,
        approved: payload?.approved,
        answer: payload?.answer,
        customText: payload?.customText,
        chosenOptions: payload?.chosenOptions,
        questionsAndAnswers
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
    callback: (msg) => {
      const rawContent =
        Array.isArray(msg.content) && msg.content.length > 0
          ? msg.content
          : [{ type: 'text', text: '' }];

      const sanitizedContent = rawContent.map((part) => {
        if (!part || typeof part !== 'object') {
          return { type: 'text', text: String(part || '') };
        }
        const pType = part.type;
        if (pType === 'submitted-ask-user' || pType === 'ask-user-response') {
          return {
            type: 'data-submitted-ask-user',
            id: part.id,
            data: { questions: part.questions || part.questionsAndAnswers || [] },
            questions: part.questions || part.questionsAndAnswers || []
          };
        }
        if (
          pType === 'text' ||
          pType === 'reasoning' ||
          pType === 'tool-call' ||
          pType === 'file' ||
          pType === 'source' ||
          pType === 'image' ||
          pType === 'data' ||
          pType === 'generative-ui' ||
          (typeof pType === 'string' && pType.startsWith('data-'))
        ) {
          return part;
        }
        return {
          type: `data-${pType || 'custom'}`,
          id: part.id,
          data: part.data || part
        };
      });

      return {
        id: msg.id,
        role: msg.role,
        content: sanitizedContent,
        attachments: msg.attachments || [],
        metadata: {
          custom: {
            runStartedAt: msg.runStartedAt,
            runCompletedAt: msg.runCompletedAt,
            runStatus: msg.runStatus,
            rawParts: msg.content || [],
            attachments: msg.attachments || []
          }
        }
      };
    }
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

  const handleCloseWorkspace = () => {
    setWorkspaceMode('chat');
    if (browserIdleTimerRef.current) {
      clearTimeout(browserIdleTimerRef.current);
      browserIdleTimerRef.current = null;
    }
    handleSendWsMessage({ type: 'close_browser' });
    fetch('/api/browser/close', { method: 'POST' }).catch(() => {});
  };

  return (
    <div className="flex h-screen w-screen bg-[#08080A] text-foreground font-sans overflow-hidden select-none">
      {/* Left icon rail: Home / BIO are the only clickable tabs */}
      <AppRail view={view} onSelectView={setView} />

      {/* Main Split Body wrapped with AssistantRuntimeProvider */}
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex-1 flex overflow-hidden relative">
          {/* Threads panel (Home view only): rounded, collapsible */}
          {view === 'home' && sidebarOpen && (
            <div className="relative z-30 my-2 mr-2 flex w-[260px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#141417] shadow-xl">
              <ThreadListSidebar className="min-h-0 w-full flex-1 border-none bg-transparent" />
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Collapse threads panel"
                title="Collapse panel"
                className="absolute right-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
          )}

          {view === 'home' && !sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open threads panel"
              title="Open threads"
              className="absolute left-2 top-[20px] z-40 flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-white/[0.08] bg-[#141417] text-zinc-400 shadow-xl transition-colors hover:text-zinc-100"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}

          {/* Rounded canvas */}
          <div className="min-w-0 flex-1 py-2 pr-2">
            <div className="relative flex h-full overflow-hidden rounded-[24px] border border-white/[0.05] bg-[#101013] shadow-xl sm:rounded-[28px]">
          {view === 'bio' ? (
            <>
              <div className="h-full min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
                <BioDashboard />
              </div>
              <AgentChatCard
                messages={messages}
                isWorking={isRunning}
                composer={
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
                }
              />
            </>
          ) : (
          <>
          {/* Center: Chat Panel (Hero or Message Thread) */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
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
                <div className="flex-1 min-h-0">
                  <Thread
                    activeInterrupt={activeInterrupt}
                    onResolveInterrupt={handleResolveInterrupt}
                    selectedModel={selectedModel}
                    onSelectModel={setSelectedModel}
                  />
                </div>

                {/* Bottom Docked Composer */}
                <div className="shrink-0 p-3 bg-[#101013] border-t border-white/[0.06] max-w-3xl w-full mx-auto">
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
          </>
          )}

          {/* Right: Workspace Panel (Home view, right edge of canvas) */}
          {view === 'home' && workspaceMode === 'work' && (
            <WorkspacePanel
              streamState={streamState}
              onSimulateUrlChange={(newUrl) =>
                setStreamState((prev) => ({ ...prev, url: newUrl }))
              }
              onManualNavigate={(targetUrl) =>
                handleSendMessage(`Navigate to ${targetUrl}`)
              }
              onSendWsMessage={handleSendWsMessage}
              openFiles={openFiles}
              activeTabId={activeTabId}
              onSelectTab={(tabId) => setActiveTabId(tabId)}
              onCloseFileTab={handleCloseFileTab}
              onClosePanel={handleCloseWorkspace}
            />
          )}

          {view === 'home' && workspaceMode === 'chat' && (
            <button
              type="button"
              onClick={() => setWorkspaceMode('work')}
              aria-label="Open workspace panel"
              title="Open workspace panel"
              className="absolute right-3 top-3 z-40 flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-white/[0.08] bg-[#141417] text-zinc-400 shadow-xl transition-colors hover:text-zinc-100"
            >
              <PanelRightOpen size={16} />
            </button>
          )}
            </div>
          </div>
        </div>
      </AssistantRuntimeProvider>
    </div>
  );
}
