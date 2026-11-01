import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useExternalMessageConverter
} from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { InputDock } from '@/components/InputDock';
import { ThreadsPanel } from '@/components/ThreadsPanel';
import { WorkspacePanel } from '@/components/WorkspacePanel';
import { AppRail } from '@/components/AppRail';
import { BioDashboard } from '@/components/BioDashboard';
import { AgentChatCard } from '@/components/AgentChatCard';
import { getUserId } from '@/lib/user';
import {
  Globe,
  PenLine,
  FileSpreadsheet,
  Laptop,
  Briefcase,
  Columns,
  Zap,
  Shuffle,
  PanelLeftOpen,
  PanelRightOpen
} from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState('chat');
  const [agentMode, setAgentMode] = useState('turbo');
  const [activeInterrupt, setActiveInterrupt] = useState(null);
  const [selectedModel, setSelectedModel] = useState('muse-spark-open');
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
  const initialThreadIdRef = useRef(`thread-${Date.now()}`);
  const [threads, setThreads] = useState(() => [
    {
      id: initialThreadIdRef.current,
      title: 'New chat',
      status: 'regular',
      lastMessageAt: new Date(),
      isGeneratingTitle: false
    }
  ]);
  const [activeThreadId, setActiveThreadId] = useState(initialThreadIdRef.current);
  const currentThreadIdRef = useRef(initialThreadIdRef.current);
  const threadMessagesMapRef = useRef({ [initialThreadIdRef.current]: [] });

  // Sync currentThreadIdRef with activeThreadId
  useEffect(() => {
    currentThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  // Keep threadMessagesMapRef updated when messages change
  useEffect(() => {
    threadMessagesMapRef.current[activeThreadId] = messages;
  }, [messages, activeThreadId]);

  // Load persistent threads tied to user profile on mount
  useEffect(() => {
    let cancelled = false;
    async function initUserThreads() {
      try {
        const res = await fetch('/api/threads', {
          headers: { 'x-user-id': getUserId() }
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data?.ok || !Array.isArray(data.threads)) return;

        if (data.threads.length > 0) {
          const loadedThreads = data.threads.map((t) => ({
            id: t.id,
            title: t.title || 'New chat',
            status: t.status || 'regular',
            lastMessageAt: new Date(t.lastMessageAt || t.createdAt || Date.now()),
            isGeneratingTitle: false
          }));
          setThreads(loadedThreads);

          const firstId = loadedThreads[0].id;
          setActiveThreadId(firstId);
          currentThreadIdRef.current = firstId;

          try {
            const threadRes = await fetch(`/api/threads/${firstId}`, {
              headers: { 'x-user-id': getUserId() }
            });
            if (threadRes.ok) {
              const threadData = await threadRes.json();
              if (!cancelled && threadData?.ok && Array.isArray(threadData?.thread?.messages)) {
                threadMessagesMapRef.current[firstId] = threadData.thread.messages;
                setMessages(threadData.thread.messages);
              }
            }
          } catch {}
        } else {
          // Initialize first thread in user database
          const freshId = `thread-${Date.now()}`;
          const initThread = {
            id: freshId,
            title: 'New chat',
            status: 'regular',
            lastMessageAt: new Date(),
            isGeneratingTitle: false
          };
          setThreads([initThread]);
          setActiveThreadId(freshId);
          currentThreadIdRef.current = freshId;
          threadMessagesMapRef.current[freshId] = [];
          setMessages([]);
          fetch('/api/threads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
            body: JSON.stringify({ id: freshId, title: 'New chat', status: 'regular', messages: [] })
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('[App] Error initializing user threads:', err);
      }
    }

    initUserThreads();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleNewChat = useCallback(() => {
    if (isRunning) return;
    const newId = `thread-${Date.now()}`;
    threadMessagesMapRef.current[newId] = [];
    const newThread = {
      id: newId,
      title: 'New chat',
      status: 'regular',
      lastMessageAt: new Date(),
      isGeneratingTitle: false
    };
    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newId);
    currentThreadIdRef.current = newId;
    setMessages([]);
    setActiveInterrupt(null);

    fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
      body: JSON.stringify({
        id: newId,
        title: 'New chat',
        status: 'regular',
        messages: []
      })
    }).catch(() => {});
  }, [isRunning]);

  const handleSwitchThread = useCallback(async (targetId) => {
    if (isRunning || targetId === activeThreadId) return;
    setActiveThreadId(targetId);
    currentThreadIdRef.current = targetId;
    setActiveInterrupt(null);

    const cached = threadMessagesMapRef.current[targetId];
    if (Array.isArray(cached) && cached.length > 0) {
      setMessages(cached);
    } else {
      try {
        const res = await fetch(`/api/threads/${targetId}`, {
          headers: { 'x-user-id': getUserId() }
        });
        if (res.ok) {
          const data = await res.json();
          const msgs = Array.isArray(data?.thread?.messages) ? data.thread.messages : [];
          threadMessagesMapRef.current[targetId] = msgs;
          setMessages(msgs);
        } else {
          setMessages(cached || []);
        }
      } catch {
        setMessages(cached || []);
      }
    }
  }, [isRunning, activeThreadId]);

  const handleRenameThread = useCallback((targetId, newTitle) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === targetId ? { ...t, title: newTitle } : t))
    );
    fetch(`/api/threads/${targetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
      body: JSON.stringify({ title: newTitle })
    }).catch(() => {});
  }, []);

  const handleDeleteThread = useCallback((targetId) => {
    fetch(`/api/threads/${targetId}`, {
      method: 'DELETE',
      headers: { 'x-user-id': getUserId() }
    }).catch(() => {});

    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== targetId);
      if (remaining.length === 0) {
        const freshId = `thread-${Date.now()}`;
        threadMessagesMapRef.current[freshId] = [];
        setActiveThreadId(freshId);
        currentThreadIdRef.current = freshId;
        setMessages([]);
        fetch('/api/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
          body: JSON.stringify({ id: freshId, title: 'New chat', status: 'regular', messages: [] })
        }).catch(() => {});
        return [
          {
            id: freshId,
            title: 'New chat',
            status: 'regular',
            lastMessageAt: new Date(),
            isGeneratingTitle: false
          }
        ];
      }
      if (activeThreadId === targetId) {
        const nextActive = remaining[0].id;
        setActiveThreadId(nextActive);
        currentThreadIdRef.current = nextActive;
        const cached = threadMessagesMapRef.current[nextActive] || [];
        setMessages(cached);
      }
      return remaining;
    });
  }, [activeThreadId]);

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

    // If this is the first message in the thread, trigger silent title generation
    const currentTId = currentThreadIdRef.current;
    const isFirstInThread = (messages.length === 0);
    if (isFirstInThread && userText.trim()) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === currentTId
            ? { ...t, isGeneratingTitle: true }
            : t
        )
      );

      (async () => {
        try {
          let genTitle = '';
          try {
            const res = await fetch('/api/thread/title', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: userText })
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.title && data.title !== 'New chat') {
                genTitle = data.title;
              }
            }
          } catch {}

          if (!genTitle) {
            let c = userText
              .replace(/https?:\/\/\S+/gi, '')
              .replace(/!\[.*?\]\(.*?\)/g, '')
              .replace(/<[^>]+>/g, '')
              .replace(/["'`]+/g, '')
              .replace(/^(can you|could you|please|i want to|i need to|help me|tell me about|how to|what is|search for|research and read their docs on|research and read docs on|research and read|research|find|look up|show me|hi|hey|hello)\s+/i, '')
              .replace(/[?!.:;,]+$/, '')
              .trim();
            if (!c) c = userText.trim();
            const w = c.split(/\s+/).filter((x) => x.length > 0 && !/^(and|the|a|an|to|for|on|with|in|of|how|we)$/i.test(x)).slice(0, 5);
            genTitle = (w.length > 0 ? w : c.split(/\s+/).slice(0, 5))
              .map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
              .join(' ')
              .slice(0, 36);
          }

          setThreads((prev) =>
            prev.map((t) =>
              t.id === currentTId
                ? { ...t, title: genTitle || 'New chat', isGeneratingTitle: false, lastMessageAt: new Date() }
                : t
            )
          );

          fetch(`/api/threads/${currentTId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
            body: JSON.stringify({ title: genTitle || 'New chat', lastMessageAt: Date.now() })
          }).catch(() => {});
        } catch {
          setThreads((prev) =>
            prev.map((t) =>
              t.id === currentTId
                ? { ...t, isGeneratingTitle: false }
                : t
            )
          );
        }
      })();
    }

    // Reset browser idle timer when user initiates new generation
    if (browserIdleTimerRef.current) {
      clearTimeout(browserIdleTimerRef.current);
      browserIdleTimerRef.current = null;
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
          parentId: messages.length > 0 ? messages[messages.length - 1].id : null,
          content: [{ type: 'text', text: userText || (orderedAttachments.length ? `[${orderedAttachments.length} attachments]` : '') }],
          attachments: orderedAttachments
        },
        {
          id: assistantMsgId,
          role: 'assistant',
          parentId: userMsgId,
          content: [],
          runStartedAt: now,
          runCompletedAt: null,
          runStatus: 'running'
        }
      ];
    }

    // Optimistically render user message, attachments, and running assistant immediately!
    setMessages(newMessages);
    setIsRunning(true);

    // Auto-open workspace when URL is in prompt
    const urlMatch = userText.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      setWorkspaceMode('work');
      setActiveTabId('browser');
    }

    // Process attachments sequentially in the background if attachments are present
    let attachmentSystemContext = '';
    if (orderedAttachments.length > 0) {
      try {
        const attRes = await fetch('/api/attachments/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attachments: orderedAttachments,
            userId: getUserId()
          })
        });
        if (attRes.ok) {
          const attData = await attRes.json();
          attachmentSystemContext = attData.contextPrompt || '';
        }
      } catch (err) {
        console.warn('[Attachments] Background sequential processing error:', err);
      }
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
          userId: getUserId(),
          instruction: chatInstruction,
          attachments: orderedAttachments.map((a) => ({
            name: a.name,
            type: a.type,
            size: a.size,
            dataUrl: a.dataUrl
          })),
          messages: newMessages
            .filter((m) => m.role === 'user' || (m.role === 'assistant' && (m.content || []).some((c) => c.type === 'text' && c.text)))
            .map((m) => ({
              role: m.role,
              content: (m.content || [])
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n'),
              attachments: m.attachments?.map((a) => ({
                name: a.name,
                type: a.type,
                size: a.size,
                dataUrl: a.dataUrl
              }))
            })),
          model: selectedModel,
          mode: agentMode,
          effort: (options.effort || 'medium').toLowerCase(),
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
                const now = Date.now();
                for (let i = 0; i < contentParts.length; i++) {
                  if (contentParts[i].type === 'reasoning' && contentParts[i].status?.type === 'running') {
                    const started = contentParts[i].startedAt || now;
                    contentParts[i] = {
                      ...contentParts[i],
                      status: { type: 'complete' },
                      completedAt: now,
                      durationMs: Math.max(500, now - started)
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
                    status: { type: 'running' },
                    startedAt: Date.now()
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
                  event.name.startsWith('snapshot_') ||
                  event.name === 'read_page'
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

                // Never end silently: if the run stopped early (step/budget/
                // repeat limits) with no final text, tell the user what happened.
                const stopReason = event.stopReason || event.summary?.stopReason;
                if (stopReason && stopReason !== 'success') {
                  const hasText = contentParts.some(
                    (p) => p.type === 'text' && typeof p.text === 'string' && p.text.trim()
                  );
                  if (!hasText) {
                    const reasonText =
                      stopReason === 'max_turns'
                        ? 'I ran out of steps before finishing this task.'
                        : stopReason === 'repeated_calls'
                          ? 'I stopped because I was repeating the same actions without making progress.'
                          : stopReason === 'timeout'
                            ? 'I ran out of time before finishing this task.'
                            : stopReason === 'max_budget'
                              ? 'I hit the run budget before finishing this task.'
                              : `I stopped before finishing this task (${stopReason}).`;
                    contentParts.push({
                      type: 'text',
                      id: `text-stop-${contentParts.length}`,
                      text: `${reasonText} Nothing was completed on the page. Please retry, or narrow the task and I'll continue.`
                    });
                  }
                } else if (!contentParts.some((p) => (p.type === 'text' && p.text?.trim()) || p.type === 'tool-call')) {
                  last.runStatus = 'error';
                  last.error = last.error || 'The model completed the turn without generating a response.';
                }

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
                last.error = event.message || event.error || 'The model and all failover endpoints failed to respond.';
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
            last.error = err.message || 'Stream connection error. The model endpoint is unavailable.';
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
            const hasTextOrTools = (last.content || []).some(
              (p) => (p.type === 'text' && typeof p.text === 'string' && p.text.trim()) || p.type === 'tool-call'
            );
            if (!hasTextOrTools) {
              last.runStatus = 'error';
              last.error = last.error || 'The model endpoint completed without returning a response.';
            } else {
              last.runStatus = 'complete';
            }
          }
          last.content = (last.content || []).map((p) => {
            if (p.type === 'reasoning' && p.status?.type === 'running') {
              const now = Date.now();
              const started = p.startedAt || last.runStartedAt || now;
              return {
                ...p,
                status: { type: 'complete' },
                completedAt: now,
                durationMs: p.durationMs || Math.max(500, now - started)
              };
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

      // Persist full conversation messages for active thread tied to user profile
      const activeTId = currentThreadIdRef.current;
      setTimeout(() => {
        const msgsToSave = threadMessagesMapRef.current[activeTId];
        if (Array.isArray(msgsToSave) && msgsToSave.length > 0) {
          fetch(`/api/threads/${activeTId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
            body: JSON.stringify({
              messages: msgsToSave,
              lastMessageAt: Date.now()
            })
          }).catch(() => {});
        }
      }, 50);
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
        parentId: msg.parentId,
        content: sanitizedContent,
        attachments: msg.attachments || [],
        status: msg.runStatus === 'error'
          ? {
              type: 'incomplete',
              reason: 'error',
              error: msg.error || 'The model and all failover endpoints failed to respond.'
            }
          : undefined,
        metadata: {
          custom: {
            runStartedAt: msg.runStartedAt,
            runCompletedAt: msg.runCompletedAt,
            runStatus: msg.runStatus,
            error: msg.error,
            rawParts: msg.content || [],
            attachments: msg.attachments || []
          }
        }
      };
    }
  });

  const threadListAdapter = useMemo(() => ({
    threadId: activeThreadId,
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title || 'New chat',
      status: 'regular',
      lastMessageAt: t.lastMessageAt,
      custom: {
        isGeneratingTitle: Boolean(t.isGeneratingTitle),
        isRunning: Boolean(isRunning && t.id === activeThreadId)
      }
    })),
    onSwitchToNewThread: handleNewChat,
    onSwitchToThread: handleSwitchThread,
    onRename: handleRenameThread,
    onDelete: handleDeleteThread
  }), [threads, activeThreadId, isRunning, handleNewChat, handleSwitchThread, handleRenameThread, handleDeleteThread]);

  const handleReload = async (parentId) => {
    if (isRunning) return;

    let targetUserMsg = null;
    let baseList = [];

    if (parentId) {
      const idx = messages.findIndex((m) => m.id === parentId);
      if (idx !== -1 && messages[idx].role === 'user') {
        targetUserMsg = messages[idx];
        baseList = messages.slice(0, idx + 1);
      }
    }

    if (!targetUserMsg) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          targetUserMsg = messages[i];
          baseList = messages.slice(0, i + 1);
          break;
        }
      }
    }

    if (!targetUserMsg) return;

    const userText = (targetUserMsg.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    const assistantMsgId = `asst-${Date.now()}`;
    const refreshedMessages = [
      ...baseList,
      {
        id: assistantMsgId,
        role: 'assistant',
        parentId: targetUserMsg.id,
        content: [],
        runStartedAt: Date.now(),
        runCompletedAt: null,
        runStatus: 'running'
      }
    ];

    await handleSendMessage(userText, {
      baseMessages: refreshedMessages,
      attachments: targetUserMsg.attachments || []
    });
  };

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages: threadMessages,
    adapters: {
      threadList: threadListAdapter
    },
    onNew: async (msg) => {
      await handleSendMessage(msg);
    },
    onReload: async (parentId) => {
      await handleReload(parentId);
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
            <div className="z-30 my-2 mr-2 flex w-[260px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#141417] shadow-xl">
              <ThreadsPanel
                onCollapse={() => setSidebarOpen(false)}
                onOpenBio={() => setView('bio')}
              />
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
                    onReload={handleReload}
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
