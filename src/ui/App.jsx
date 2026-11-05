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
import { AuthScreen } from '@/components/AuthScreen';
import { SettingsModal } from '@/components/SettingsModal';
import { ThreadListRoot, ThreadListItems } from '@/components/assistant-ui/elements/thread-list.aui';
import { getUserId, getCurrentUser, setCurrentUser, clearCurrentUser } from '@/lib/user';
import { sanitizeChatText } from '../core/levels/redact-text.js';
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
  PanelRightOpen,
  AlertCircle,
  Menu,
  Ghost,
  Home,
  Leaf,
  MessageSquare,
  History,
  Library,
  AtSign,
  MoreHorizontal,
  Settings,
  SquarePen,
  Search,
  X
} from 'lucide-react';
import { validateReturnTo } from './lib/url.js';

function getInitialRouteState() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path === '/bio') {
    return { view: 'bio', settingsOpen: false, settingsTab: 'keys' };
  }
  if (path.startsWith('/settings')) {
    const tab = path.includes('account') ? 'account' : 'keys';
    return { view: 'home', settingsOpen: true, settingsTab: tab };
  }
  return { view: 'home', settingsOpen: false, settingsTab: 'keys' };
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState('chat');
  const [agentMode, setAgentMode] = useState('turbo');
  const [activeInterrupt, setActiveInterrupt] = useState(null);
  const [selectedModel, setSelectedModel] = useState('muse-spark-open');
  const [actionSetIndex, setActionSetIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const initialRoute = useMemo(() => getInitialRouteState(), []);
  const [view, setView] = useState(initialRoute.view);
  const [openFiles, setOpenFiles] = useState([]);
  const [activeTabId, setActiveTabId] = useState('plus');
  const [currentUser, setLocalCurrentUser] = useState(() => getCurrentUser());
  const [authChecking, setAuthChecking] = useState(true);
  const [notFoundNotice, setNotFoundNotice] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(initialRoute.settingsOpen);
  const [settingsTab, setSettingsTab] = useState(initialRoute.settingsTab);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [mobileBioChatOpen, setMobileBioChatOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerSearchOpen, setDrawerSearchOpen] = useState(false);
  const [bioMessages, setBioMessages] = useState([]);
  const [isBioRunning, setIsBioRunning] = useState(false);
  const [bioActiveInterrupt, setBioActiveInterrupt] = useState(null);
  const bioAbortControllerRef = useRef(null);

  // Check authenticated session on mount (Zero-Flash Route Guard)
  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.ok && data.user) {
            setCurrentUser(data.user);
            setLocalCurrentUser(data.user);

            // If user logged in and on /login route, redirect to returnTo or /new
            const currentPath = window.location.pathname;
            if (currentPath === '/login') {
              const params = new URLSearchParams(window.location.search);
              const returnTo = validateReturnTo(params.get('returnTo'));
              const target = (returnTo === '/' || !returnTo) ? '/new' : returnTo;
              window.history.replaceState(null, '', target);
              if (target === '/bio') {
                setView('bio');
              } else if (target.startsWith('/settings')) {
                setSettingsOpen(true);
                setSettingsTab(target.includes('account') ? 'account' : 'keys');
              }
            } else if (currentPath === '/bio') {
              setView('bio');
            } else if (currentPath.startsWith('/settings')) {
              setSettingsOpen(true);
              setSettingsTab(currentPath.includes('account') ? 'account' : 'keys');
            } else if (currentPath === '/' || currentPath === '') {
              window.history.replaceState(null, '', '/new');
            }
          }
        } else {
          if (!cancelled) {
            clearCurrentUser();
            setLocalCurrentUser(null);

            // Unauthenticated: redirect to /login?returnTo=... before any chat screen is drawn
            const currentPath = window.location.pathname;
            const currentSearch = window.location.search;
            if (currentPath !== '/login') {
              const fullPath = (currentPath === '/' ? '/new' : currentPath) + currentSearch;
              const returnToParam = encodeURIComponent(fullPath);
              window.history.replaceState(null, '', `/login?returnTo=${returnToParam}`);
            }
          }
        }
      } catch {
        if (!cancelled) {
          clearCurrentUser();
          setLocalCurrentUser(null);
        }
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    }
    checkAuth();
    return () => { cancelled = true; };
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setLocalCurrentUser(user);

    // Validate returnTo parameter before redirecting
    const params = new URLSearchParams(window.location.search);
    const returnTo = validateReturnTo(params.get('returnTo'));
    const target = (returnTo === '/' || !returnTo) ? '/new' : returnTo;
    window.history.replaceState(null, '', target);
    if (target === '/bio') {
      setView('bio');
    } else if (target.startsWith('/settings')) {
      setSettingsOpen(true);
      setSettingsTab(target.includes('account') ? 'account' : 'keys');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, 'User logged out');
      } catch {}
      wsRef.current = null;
    }
    clearCurrentUser();
    setLocalCurrentUser(null);
    setMessages([]);
    setBioMessages([]);
    setThreads([]);
    threadMessagesMapRef.current = {};
    setOpenFiles([]);
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.history.replaceState(null, '', '/login');
  };

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
    title: 'Dotta Browser Viewport — Ready',
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
  const isSendingRef = useRef(false);
  const wsRef = useRef(null);
  const browserIdleTimerRef = useRef(null);
  const initialThreadIdRef = useRef(typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `thread-${Date.now()}`);
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

  // Load persistent threads tied to authenticated user profile on mount
  useEffect(() => {
    let cancelled = false;
    if (authChecking || !currentUser) return;

    async function initUserThreads() {
      try {
        const res = await fetch('/api/threads');
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data?.ok || !Array.isArray(data.threads)) return;

        // Check if there is an initial thread in the URL e.g. /chat/<uuid>
        const chatMatch = window.location.pathname.match(/^\/chat\/([a-zA-Z0-9-]+)/);
        const urlThreadId = chatMatch ? chatMatch[1] : null;

        if (urlThreadId) {
          // Attempt to load the thread from URL
          const threadRes = await fetch(`/api/threads/${urlThreadId}`);
          if (threadRes.status === 404 || !threadRes.ok) {
            // Not found or not owned -> show 404 notice and redirect to /new
            if (!cancelled) {
              setNotFoundNotice({
                active: true,
                message: 'Chat not found. This thread does not exist or you do not have permission to access it.'
              });
              setTimeout(() => {
                if (!cancelled) {
                  setNotFoundNotice(null);
                  handleNewChat(false);
                }
              }, 2500);
            }
            return;
          }

          const threadData = await threadRes.json();
          if (!cancelled && threadData?.ok && threadData.thread) {
            const currentThread = threadData.thread;
            const msgs = Array.isArray(currentThread.messages) ? currentThread.messages : [];
            threadMessagesMapRef.current[urlThreadId] = msgs;
            setMessages(msgs);
            setActiveThreadId(urlThreadId);
            const rawThreads = data.threads.length > 0 ? data.threads : [currentThread];
            const loadedThreads = rawThreads.map((t) => ({
              id: t.id,
              title: t.title || 'New chat',
              status: t.status || 'regular',
              lastMessageAt: t.lastMessageAt instanceof Date ? t.lastMessageAt : new Date(t.lastMessageAt || t.createdAt || Date.now()),
              isGeneratingTitle: false
            }));
            setThreads(loadedThreads);

            // If loaded thread has 0 messages, user is at home with no sent messages -> normalize to /new
            if (msgs.length === 0) {
              window.history.replaceState(null, '', '/new');
            }
            return;
          }
        }

        if (data.threads.length > 0) {
          const loadedThreads = data.threads.map((t) => ({
            id: t.id,
            title: t.title || 'New chat',
            status: t.status || 'regular',
            lastMessageAt: new Date(t.lastMessageAt || t.createdAt || Date.now()),
            isGeneratingTitle: false
          }));
          setThreads(loadedThreads);
        }

        // When user is at home / new chat and has not sent a message, URL must be /new (not a premature UUID)
        const curPath = window.location.pathname;
        if (
          curPath === '/' ||
          curPath === '/new' ||
          (!curPath.startsWith('/chat/') && !curPath.startsWith('/settings') && curPath !== '/bio')
        ) {
          const draftId = `draft-${Date.now()}`;
          setActiveThreadId(draftId);
          currentThreadIdRef.current = draftId;
          threadMessagesMapRef.current[draftId] = [];
          setMessages([]);
          if (curPath !== '/new') {
            window.history.replaceState(null, '', '/new');
          }
        }
      } catch (err) {
        console.warn('[App] Error initializing user threads:', err);
      }
    }

    initUserThreads();
    return () => {
      cancelled = true;
    };
  }, [authChecking, currentUser]);

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
    window.addEventListener('dotta:open-file', handleOpenFile);
    return () => {
      window.removeEventListener('dotta:open-file', handleOpenFile);
    };
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

  const handleNewChat = useCallback((pushHistory = true) => {
    if (isRunning) return;
    const draftId = `draft-${Date.now()}`;
    setActiveThreadId(draftId);
    currentThreadIdRef.current = draftId;
    threadMessagesMapRef.current[draftId] = [];
    setMessages([]);
    setOpenFiles([]);
    setActiveTabId('browser');
    setActiveInterrupt(null);
    setView('home');
    setSettingsOpen(false);
    if (pushHistory) {
      window.history.pushState(null, '', '/new');
    } else {
      window.history.replaceState(null, '', '/new');
    }
  }, [isRunning]);

  const handleSwitchThread = useCallback(async (targetId) => {
    if (isRunning) return;
    setActiveInterrupt(null);
    setView('home');
    setSettingsOpen(false);
    if (targetId === activeThreadId) return;

    const cached = threadMessagesMapRef.current[targetId];
    setOpenFiles([]);
    setActiveTabId('browser');
    if (Array.isArray(cached) && cached.length > 0) {
      setActiveThreadId(targetId);
      currentThreadIdRef.current = targetId;
      setMessages(cached);
      window.history.pushState(null, '', '/chat/' + targetId);
    } else {
      try {
        const res = await fetch(`/api/threads/${targetId}`);
        if (res.status === 404) {
          setNotFoundNotice({
            active: true,
            message: 'Chat not found (404). This thread does not exist or you do not have permission to access it.'
          });
          return;
        }
        if (res.ok) {
          const data = await res.json();
          const msgs = Array.isArray(data?.thread?.messages) ? data.thread.messages : [];
          threadMessagesMapRef.current[targetId] = msgs;
          setActiveThreadId(targetId);
          currentThreadIdRef.current = targetId;
          setMessages(msgs);
          if (msgs.length > 0) {
            window.history.pushState(null, '', '/chat/' + targetId);
          } else {
            window.history.replaceState(null, '', '/new');
          }
        } else {
          setNotFoundNotice({
            active: true,
            message: 'Chat not found (404). This thread does not exist or you do not have permission to access it.'
          });
        }
      } catch {
        setNotFoundNotice({
          active: true,
          message: 'Chat not found (404). This thread does not exist or you do not have permission to access it.'
        });
      }
    }
  }, [isRunning, activeThreadId]);

  const handleRenameThread = useCallback((targetId, newTitle) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === targetId ? { ...t, title: newTitle } : t))
    );
    fetch(`/api/threads/${targetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    }).catch(() => {});
  }, []);

  const handleDeleteThread = useCallback((targetId) => {
    fetch(`/api/threads/${targetId}`, {
      method: 'DELETE'
    }).catch(() => {});

    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== targetId);
      if (remaining.length === 0) {
        handleNewChat(true);
        return [];
      }
      if (activeThreadId === targetId) {
        const nextActive = remaining[0].id;
        setActiveThreadId(nextActive);
        currentThreadIdRef.current = nextActive;
        const cached = threadMessagesMapRef.current[nextActive] || [];
        setMessages(cached);
        if (cached.length > 0) {
          window.history.pushState(null, '', '/chat/' + nextActive);
        } else {
          window.history.pushState(null, '', '/new');
        }
      }
      return remaining;
    });
  }, [activeThreadId, handleNewChat]);

  // Handle browser back/forward history navigation across /bio, /settings, /new, and /chat/:id
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/bio') {
        setView('bio');
        setSettingsOpen(false);
      } else if (path.startsWith('/settings')) {
        setSettingsOpen(true);
        setSettingsTab(path.includes('account') ? 'account' : 'keys');
      } else if (path === '/new' || path === '/' || path === '') {
        setView('home');
        setSettingsOpen(false);
        handleNewChat(false);
      } else {
        const chatMatch = path.match(/^\/chat\/([a-zA-Z0-9-]+)/);
        if (chatMatch) {
          setView('home');
          setSettingsOpen(false);
          const targetId = chatMatch[1];
          if (targetId !== currentThreadIdRef.current) {
            handleSwitchThread(targetId);
          }
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleSwitchThread, handleNewChat]);

  const handleSelectView = useCallback((nextView) => {
    setView(nextView);
    setSettingsOpen(false);
    if (nextView === 'bio') {
      window.history.pushState(null, '', '/bio');
    } else {
      const activeTId = currentThreadIdRef.current;
      const cached = threadMessagesMapRef.current[activeTId] || [];
      if (cached.length > 0 && !activeTId.startsWith('draft-')) {
        window.history.pushState(null, '', `/chat/${activeTId}`);
      } else {
        window.history.pushState(null, '', '/new');
      }
    }
  }, []);

  const handleOpenSettings = useCallback((tab = 'keys') => {
    setSettingsOpen(true);
    setSettingsTab(tab);
    window.history.pushState(null, '', tab === 'account' ? '/settings/account' : '/settings');
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    if (view === 'bio') {
      window.history.pushState(null, '', '/bio');
    } else {
      const activeTId = currentThreadIdRef.current;
      const cached = threadMessagesMapRef.current[activeTId] || [];
      if (cached.length > 0 && !activeTId.startsWith('draft-')) {
        window.history.pushState(null, '', `/chat/${activeTId}`);
      } else {
        window.history.pushState(null, '', '/new');
      }
    }
  }, [view]);

  const handleSettingsTabChange = useCallback((tab) => {
    setSettingsTab(tab);
    window.history.replaceState(null, '', tab === 'account' ? '/settings/account' : '/settings');
  }, []);

  // Listen for open settings events from API key error action card
  useEffect(() => {
    const handleOpenSettingsEvent = (e) => {
      const tab = e.detail?.tab || 'keys';
      handleOpenSettings(tab);
    };
    window.addEventListener('dotta:open-settings', handleOpenSettingsEvent);
    return () => window.removeEventListener('dotta:open-settings', handleOpenSettingsEvent);
  }, [handleOpenSettings]);

  const handleDismissNotFound = useCallback(() => {
    setNotFoundNotice(null);
    window.history.replaceState(null, '', '/new');
    handleNewChat(false);
  }, [handleNewChat]);

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

    if ((!userText.trim() && orderedAttachments.length === 0) || (!options.isResume && (isRunning || isSendingRef.current))) return;
    isSendingRef.current = true;

    // Allocate real thread UUID on first message submit and update URL from /new to /chat/:id
    let currentTId = currentThreadIdRef.current;
    const isFirstInThread = (messages.length === 0) || (currentTId && currentTId.startsWith('draft-'));

    if (isFirstInThread) {
      const realThreadId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `thread-${Date.now()}`;
      currentTId = realThreadId;
      currentThreadIdRef.current = realThreadId;
      setActiveThreadId(realThreadId);
      threadMessagesMapRef.current[realThreadId] = [];

      // Save initial thread to database
      fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: realThreadId,
          title: 'New chat',
          status: 'regular',
          messages: []
        })
      }).catch(() => {});

      // Insert thread into list and update URL to /chat/<realThreadId>
      setThreads((prev) => [
        {
          id: realThreadId,
          title: 'New chat',
          status: 'regular',
          lastMessageAt: new Date(),
          isGeneratingTitle: Boolean(userText.trim())
        },
        ...prev.filter((t) => t.id !== realThreadId && !t.id.startsWith('draft-'))
      ]);

      window.history.pushState(null, '', `/chat/${realThreadId}`);
    } else if (currentTId && window.location.pathname !== `/chat/${currentTId}`) {
      window.history.pushState(null, '', `/chat/${currentTId}`);
    }

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
            headers: { 'Content-Type': 'application/json' },
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
          attachments: orderedAttachments,
          createdAt: now,
          model: selectedModel,
          metadata: {
            custom: {
              createdAt: now,
              model: selectedModel,
              attachments: orderedAttachments
            }
          }
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
        if (attRes.status === 403) {
          const errData = await attRes.json().catch(() => ({}));
          if (errData.code === 'KEY_REQUIRED') {
            const activeTId = currentThreadIdRef.current;
            const assistantErrMessage = {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: '',
              status: 'error',
              error: 'KEY_REQUIRED: A Meta API key is required to process audio attachments. Please configure your key in Settings -> Account.',
              timestamp: Date.now()
            };
            setThreadMessagesMap((prev) => ({
              ...prev,
              [activeTId]: [...(prev[activeTId] || []), assistantErrMessage]
            }));
            setIsWorking(false);
            return;
          }
        }
        if (attRes.status === 429) {
          const errData = await attRes.json().catch(() => ({}));
          const activeTId = currentThreadIdRef.current;
          const assistantErrMessage = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: '',
            status: 'error',
            error: errData.error || 'RATE_LIMITED: Meta API rate limit reached on audio processing. Please wait a moment.',
            timestamp: Date.now()
          };
          setThreadMessagesMap((prev) => ({
            ...prev,
            [activeTId]: [...(prev[activeTId] || []), assistantErrMessage]
          }));
          setIsWorking(false);
          return;
        }
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
            .filter(
              (m) =>
                m.role === 'user' ||
                (m.role === 'assistant' &&
                  (m.content || []).some(
                    (c) =>
                      (c.type === 'text' && c.text) ||
                      c.type === 'data-submitted-ask-user' ||
                      c.type === 'submitted-ask-user'
                  ))
            )
            .map((m) => {
              const textParts = (m.content || [])
                .filter((c) => c.type === 'text')
                .map((c) => c.text);
              const qaParts = (m.content || [])
                .filter(
                  (c) =>
                    c.type === 'data-submitted-ask-user' ||
                    c.type === 'submitted-ask-user'
                )
                .map((c) => {
                  const list = c.questions || c.data?.questions || [];
                  return list
                    .map((qa) => `[Confirmed Answer]: ${qa.question} -> ${qa.answer}`)
                    .join('\n');
                });
              const combinedText = [...textParts, ...qaParts].filter(Boolean).join('\n');
              return {
                role: m.role,
                content: combinedText,
                attachments: m.attachments?.map((a) => ({
                  name: a.name,
                  type: a.type,
                  size: a.size,
                  dataUrl: a.dataUrl
                }))
              };
            }),
          model: selectedModel,
          mode: agentMode,
          effort: (options.effort || 'medium').toLowerCase(),
          resume: options.resume || null
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        let errData = null;
        try {
          errData = await response.json();
        } catch {}
        const errMsg = errData?.error || `Server returned HTTP ${response.status}`;
        const err = new Error(errMsg);
        if (errData?.code) err.code = errData.code;
        throw err;
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
                  const rawText = (lastPart.rawText ?? lastPart.text) + event.chunk;
                  contentParts[contentParts.length - 1] = {
                    ...lastPart,
                    rawText,
                    text: sanitizeChatText(rawText)
                  };
                } else {
                  contentParts.push({
                    type: 'text',
                    id: `text-${contentParts.length}`,
                    rawText: event.chunk,
                    text: sanitizeChatText(event.chunk)
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

                // End of run: kill browser instance after 60s
                if (browserIdleTimerRef.current) {
                  clearTimeout(browserIdleTimerRef.current);
                }
                browserIdleTimerRef.current = setTimeout(() => {
                  console.log('[App] 60s reached after run. Killing live browser instance...');
                  setWorkspaceMode('chat');
                  handleSendWsMessage({ type: 'close_browser' });
                  fetch('/api/browser/close', { method: 'POST' }).catch(() => {});
                }, 60000);
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
      isSendingRef.current = false;
      setIsRunning(false);

      // Persist full conversation messages for active thread tied to user profile
      const activeTId = currentThreadIdRef.current;
      setTimeout(() => {
        const msgsToSave = threadMessagesMapRef.current[activeTId];
        if (Array.isArray(msgsToSave) && msgsToSave.length > 0) {
          fetch(`/api/threads/${activeTId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
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
        args: interrupt.metadata?.toolArgs,
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

  const handleCancelBio = () => {
    if (bioAbortControllerRef.current) {
      bioAbortControllerRef.current.abort();
      setIsBioRunning(false);
    }
  };

  const handleResolveBioInterrupt = async (interrupt, payload) => {
    setBioActiveInterrupt(null);
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

    let hasAssistant = false;
    const nextMessages = bioMessages.map((m, idx) => {
      if (idx === bioMessages.length - 1 && m.role === 'assistant') {
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
        id: `bio-asst-${Date.now()}`,
        role: 'assistant',
        content: [qaPart],
        runStartedAt: Date.now(),
        runCompletedAt: null,
        runStatus: 'running'
      });
    }

    setBioMessages(nextMessages);

    await handleSendBioMessage(answerText, {
      isResume: true,
      baseMessages: nextMessages,
      resume: {
        toolName: interrupt.metadata?.toolName,
        args: interrupt.metadata?.toolArgs,
        approved: payload?.approved,
        answer: payload?.answer,
        customText: payload?.customText,
        chosenOptions: payload?.chosenOptions,
        questionsAndAnswers
      }
    });
  };

  const handleSendBioMessage = async (userMessage, options = {}) => {
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

    if ((!userText.trim() && orderedAttachments.length === 0) || (!options.isResume && isBioRunning)) return;

    const now = Date.now();
    const userMsgId = `bio-user-${now}`;
    const assistantMsgId = `bio-asst-${now}`;

    let newMessages;
    if (options.baseMessages) {
      newMessages = options.baseMessages;
    } else if (options.isResume) {
      newMessages = bioMessages.map((m, idx) => {
        if (idx === bioMessages.length - 1 && m.role === 'assistant') {
          return {
            ...m,
            runStatus: 'running'
          };
        }
        return m;
      });
    } else {
      newMessages = [
        ...bioMessages,
        {
          id: userMsgId,
          role: 'user',
          parentId: bioMessages.length > 0 ? bioMessages[bioMessages.length - 1].id : null,
          content: [{ type: 'text', text: userText || (orderedAttachments.length ? `[${orderedAttachments.length} attachments]` : '') }],
          attachments: orderedAttachments,
          createdAt: now,
          model: selectedModel,
          metadata: {
            custom: {
              createdAt: now,
              model: selectedModel,
              attachments: orderedAttachments
            }
          }
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

    setBioMessages(newMessages);
    setIsBioRunning(true);

    const controller = new AbortController();
    bioAbortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: `bio-${getUserId() || 'session'}`,
          userId: getUserId(),
          instruction: userText,
          attachments: orderedAttachments.map((a) => ({
            name: a.name,
            type: a.type,
            size: a.size,
            dataUrl: a.dataUrl
          })),
          messages: newMessages
            .filter(
              (m) =>
                m.role === 'user' ||
                (m.role === 'assistant' &&
                  (m.content || []).some(
                    (c) =>
                      (c.type === 'text' && c.text) ||
                      c.type === 'data-submitted-ask-user' ||
                      c.type === 'submitted-ask-user'
                  ))
            )
            .map((m) => {
              const textParts = (m.content || [])
                .filter((c) => c.type === 'text')
                .map((c) => c.text);
              const qaParts = (m.content || [])
                .filter(
                  (c) =>
                    c.type === 'data-submitted-ask-user' ||
                    c.type === 'submitted-ask-user'
                )
                .map((c) => {
                  const list = c.questions || c.data?.questions || [];
                  return list
                    .map((qa) => `[Confirmed Answer]: ${qa.question} -> ${qa.answer}`)
                    .join('\n');
                });
              const combinedText = [...textParts, ...qaParts].filter(Boolean).join('\n');
              return {
                role: m.role,
                content: combinedText,
                attachments: m.attachments?.map((a) => ({
                  name: a.name,
                  type: a.type,
                  size: a.size,
                  dataUrl: a.dataUrl
                }))
              };
            }),
          model: selectedModel,
          mode: agentMode,
          effort: (options.effort || 'medium').toLowerCase(),
          resume: options.resume || null
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        let errData = null;
        try {
          errData = await response.json();
        } catch {}
        const errMsg = errData?.error || `Server returned HTTP ${response.status}`;
        throw new Error(errMsg);
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
              setBioActiveInterrupt({
                id: event.id || `interrupt-${Date.now()}`,
                reason: event.reason || 'user_question',
                message: event.question || event.message || 'Input requested',
                metadata: {
                  toolName: event.tool || event.pendingTool,
                  toolArgs: event.args || {}
                }
              });
              setBioMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                if (last && last.role === 'assistant') {
                  last.runStatus = 'requires-action';
                  updated[updated.length - 1] = last;
                }
                return updated;
              });
              continue;
            }

            if (event.type === 'TEXT_CHUNK' && event.chunk) {
              setBioMessages((prev) => {
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                if (last && last.role === 'assistant') {
                  const contentParts = [...(last.content || [])];
                  const lastPart = contentParts[contentParts.length - 1];
                  if (lastPart && lastPart.type === 'text') {
                    const rawText = (lastPart.rawText ?? lastPart.text) + event.chunk;
                    contentParts[contentParts.length - 1] = {
                      ...lastPart,
                      rawText,
                      text: sanitizeChatText(rawText)
                    };
                  } else {
                    contentParts.push({
                      type: 'text',
                      id: `text-${contentParts.length}`,
                      rawText: event.chunk,
                      text: sanitizeChatText(event.chunk)
                    });
                  }
                  last.content = contentParts;
                  updated[updated.length - 1] = last;
                }
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[BioChat] Error:', err);
        setBioMessages((prev) => {
          const updated = [...prev];
          const last = { ...updated[updated.length - 1] };
          if (last && last.role === 'assistant') {
            last.runStatus = 'error';
            last.error = err.message || 'BIO Assist request failed';
            updated[updated.length - 1] = last;
          }
          return updated;
        });
      }
    } finally {
      setIsBioRunning(false);
      setBioMessages((prev) => {
        const updated = [...prev];
        const last = { ...updated[updated.length - 1] };
        if (last && last.role === 'assistant') {
          last.runCompletedAt = last.runCompletedAt || Date.now();
          if (last.runStatus === 'running') {
            last.runStatus = 'complete';
          }
          updated[updated.length - 1] = last;
        }
        return updated;
      });
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
        if (pType === 'text' && msg.role === 'assistant') {
          // eslint-disable-next-line no-unused-vars
          const { rawText, ...safePart } = part;
          return { ...safePart, text: sanitizeChatText(safePart.text) };
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
            attachments: msg.attachments || [],
            model: msg.model || msg.metadata?.custom?.model,
            createdAt: msg.createdAt || msg.metadata?.custom?.createdAt
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
      lastMessageAt: t.lastMessageAt instanceof Date ? t.lastMessageAt : new Date(t.lastMessageAt || Date.now()),
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

  if (!currentUser) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col lg:flex-row w-full h-full bg-[#08080A] text-foreground font-sans overflow-hidden select-none">
      {/* Left icon rail (Desktop only): Home / BIO are the only clickable tabs */}
      <div className="hidden lg:flex shrink-0">
        <AppRail
          view={view}
          onSelectView={handleSelectView}
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenSettings={() => handleOpenSettings('keys')}
        />
      </div>

      {/* Main App Container wrapped with AssistantRuntimeProvider */}
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

          {/* Mobile & Tablet Fixed Top Bar (lg:hidden) */}
          <header className="h-14 shrink-0 bg-[#0E0E12]/90 backdrop-blur-md border-b border-white/[0.07] px-3 flex items-center justify-between z-30 select-none lg:hidden">
            {/* Left: Hamburger Button (Opens Sidebar Drawer) */}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open sidebar drawer"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
            >
              <Menu size={20} />
            </button>

            {/* Center: Blank (No name, No Dotta logo per Eddy) */}
            <div className="flex-1" />

            {/* Right: Incognito Icon (Strictly unclickable) + Workspace Reveal Icon (Hidden on BIO page per Eddy) */}
            {view === 'home' && (
              <div className="flex items-center gap-1">
                <span
                  title="Incognito Mode"
                  aria-hidden="true"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 pointer-events-none select-none cursor-default"
                >
                  <Ghost size={20} />
                </span>

                <button
                  type="button"
                  onClick={() => setMobileWorkspaceOpen(true)}
                  title="Workspace"
                  aria-label="Open workspace"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
                >
                  <PanelRightOpen size={20} />
                </button>
              </div>
            )}
          </header>

          {/* Main Body Split / Canvas */}
          <div className="flex-1 flex overflow-hidden relative min-w-0">
            {/* Desktop Threads panel (Home view only): rounded, collapsible */}
            {view === 'home' && sidebarOpen && (
              <div className="hidden lg:flex z-30 my-2 mr-2 w-[260px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#141417] shadow-xl">
                <ThreadsPanel
                  onCollapse={() => setSidebarOpen(false)}
                  onOpenBio={() => handleSelectView('bio')}
                />
              </div>
            )}

            {view === 'home' && !sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open threads panel"
                title="Open threads"
                className="hidden lg:flex absolute left-2 top-[20px] z-40 h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-white/[0.08] bg-[#141417] text-zinc-400 shadow-xl transition-colors hover:text-zinc-100"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}

            {/* Canvas */}
            <div className="min-w-0 flex-1 p-0 lg:py-2 lg:pr-2 h-full flex flex-col">
              <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden rounded-none lg:rounded-[24px] border-0 lg:border border-white/[0.05] bg-[#101013] shadow-none lg:shadow-xl sm:rounded-none lg:sm:rounded-[28px]">
                {view === 'bio' ? (
                  <>
                    <div className="h-full min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
                      <BioDashboard />
                    </div>
                    {/* Desktop Agent Chat Card (hidden on mobile/tablet) */}
                    <AgentChatCard
                      className="hidden lg:flex"
                      messages={bioMessages}
                      isWorking={isBioRunning}
                      composer={
                        <InputDock
                          heroMode={false}
                          maxWidth="100%"
                          onSendMessage={handleSendBioMessage}
                          isWorking={isBioRunning}
                          onStopWorking={handleCancelBio}
                          selectedModel={selectedModel}
                          onSelectModel={setSelectedModel}
                          mode={agentMode}
                          onChangeMode={setAgentMode}
                          activeInterrupt={bioActiveInterrupt}
                          onResolveInterrupt={handleResolveBioInterrupt}
                        />
                      }
                    />
                  </>
                ) : (
                  <>
                    {/* Center: Chat Panel (Hero or Message Thread) */}
                    <div className={`min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden relative ${
                      workspaceMode === 'work'
                        ? 'w-full lg:w-[420px] xl:w-[460px] 2xl:w-[520px] lg:shrink-0'
                        : 'flex-1 w-full'
                    }`}>
                      {messages.length === 0 ? (
                        /* Centered Hero View (Matching Prototype Image 4 on mobile, untouched on desktop) */
                        <div className="flex-1 min-h-0 flex flex-col justify-between lg:justify-center items-center px-3 sm:px-4 pt-1 sm:pt-4 pb-0 lg:p-6 select-none relative z-10 max-w-2xl mx-auto w-full h-full overflow-y-auto lg:overflow-visible">
                          {/* Center Content */}
                          <div className="flex-1 lg:flex-initial flex flex-col items-center justify-center text-center my-0 lg:my-auto px-2 w-full">
                            {/* Authentic Dotta Orb Logo (Ref prompt 8 & Image 4) */}
                            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-2.5 sm:mb-4 shadow-xl shrink-0">
                              <svg viewBox="0 0 128 128" className="w-full h-full">
                                <defs>
                                  <radialGradient id="heroOrbGrad" cx="35%" cy="30%" r="75%">
                                    <stop offset="0%" stopColor="#ffffff"/>
                                    <stop offset="40%" stopColor="#e4e4e7"/>
                                    <stop offset="75%" stopColor="#71717a"/>
                                    <stop offset="100%" stopColor="#27272a"/>
                                  </radialGradient>
                                  <filter id="heroOrbShadow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.4"/>
                                  </filter>
                                </defs>
                                <circle cx="64" cy="64" r="52" fill="url(#heroOrbGrad)" stroke="#18181b" strokeWidth="2" filter="url(#heroOrbShadow)"/>
                                <ellipse cx="46" cy="42" rx="18" ry="12" fill="#ffffff" opacity="0.6" transform="rotate(-28 46 42)"/>
                                <circle cx="42" cy="38" r="4" fill="#ffffff" opacity="0.8"/>
                              </svg>
                            </div>

                            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-white mb-1.5 lg:mb-2 text-center">
                              Dotta
                            </h1>
                            <p className="text-xs sm:text-base text-zinc-400 max-w-xs sm:max-w-lg mb-3 sm:mb-8 text-center line-clamp-2 sm:line-clamp-none">
                              {heroSubtitles[subtitleIndex]}
                            </p>

                            {/* Desktop only: Composer in center */}
                            <div className="hidden lg:block w-full">
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
                            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-1 sm:mt-2 lg:mt-4 max-w-sm sm:max-w-xl">
                              {activeQuickActions.map((chip, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleSendMessage(chip.label)}
                                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11.5px] sm:text-xs font-medium border border-white/[0.08] bg-[#141417] lg:bg-[#18181c]/80 hover:bg-[#222228] text-zinc-300 hover:text-white transition cursor-pointer"
                                >
                                  <span className="text-zinc-400">{chip.icon}</span>
                                  <span>{chip.label}</span>
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={handleShuffleQuickActions}
                                className="p-1 sm:p-1.5 rounded-full border border-white/[0.08] bg-[#141417] lg:bg-[#18181c]/80 hover:bg-[#222228] text-zinc-400 hover:text-white transition cursor-pointer"
                                title="Shuffle suggestions"
                              >
                                <Shuffle size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Mobile only: Composer anchored floating above bottom bezel and soft navigation keys */}
                          <div className="lg:hidden w-full shrink-0 px-2 pt-2 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))]">
                            <InputDock
                              heroMode={true}
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
                      ) : (
                        /* Active Message Thread with Floating Composer on Mobile/Tablet */
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative w-full">
                          <div className="flex-1 min-h-0 flex flex-col h-full">
                            <Thread
                              activeInterrupt={activeInterrupt}
                              onResolveInterrupt={handleResolveInterrupt}
                              selectedModel={selectedModel}
                              onSelectModel={setSelectedModel}
                              onReload={handleReload}
                              onSendMessage={handleSendMessage}
                            />
                          </div>

                          {/* Mobile/Tablet Soft Dark Gradient Fade (Layer 2) */}
                          <div
                            className="pointer-events-none absolute bottom-0 left-0 right-0 h-44 sm:h-48 z-10 lg:hidden bg-gradient-to-t from-[#101013] via-[#101013]/85 to-transparent"
                            aria-hidden="true"
                          />

                          {/* Composer Container: Floating on Mobile/Tablet (Layer 3), Docked on Desktop */}
                          <div className="absolute lg:static bottom-0 left-0 right-0 z-20 pointer-events-none lg:pointer-events-auto px-3 sm:px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] lg:p-3 lg:pb-6 lg:bg-[#101013] lg:border-t lg:border-white/[0.06] border-t-0">
                            <div className="max-w-3xl w-full mx-auto pointer-events-auto">
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
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Right: Desktop Workspace Panel (Home view, right edge of canvas) */}
                {view === 'home' && workspaceMode === 'work' && (
                  <div className="hidden lg:flex flex-1 min-w-0 h-full w-full">
                    <WorkspacePanel
                      threadId={activeThreadId}
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
                  </div>
                )}

                {view === 'home' && workspaceMode === 'chat' && (
                  <button
                    type="button"
                    onClick={() => setWorkspaceMode('work')}
                    aria-label="Open workspace panel"
                    title="Open workspace panel"
                    className="hidden lg:flex absolute right-3 top-3 z-40 h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-white/[0.08] bg-[#141417] text-zinc-400 shadow-xl transition-colors hover:text-zinc-100"
                  >
                    <PanelRightOpen size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Mobile & Tablet Off-Canvas Sidebar Drawer */}
          {mobileDrawerOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <div
                className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity cursor-pointer"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close menu"
              />
              <aside className="relative z-10 w-[82%] max-w-[310px] h-full bg-[#121216] border-r border-white/[0.08] shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-left duration-200">
                <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
                  <span className="text-sm font-semibold text-white tracking-tight">Dotta</span>
                  <button
                    type="button"
                    onClick={() => setDrawerSearchOpen((prev) => !prev)}
                    title="Search"
                    aria-label="Search chats"
                    className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer"
                  >
                    <Search size={16} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1 relative">
                  {drawerSearchOpen && (
                    <div className="px-1 py-1">
                      <input
                        type="text"
                        value={drawerSearch}
                        onChange={(e) => setDrawerSearch(e.target.value)}
                        placeholder="Search chats..."
                        autoFocus
                        className="w-full bg-[#18181d] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectView('home');
                        setMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-normal transition cursor-pointer ${
                        view === 'home'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      <Home size={16} className="text-zinc-400" />
                      <span>Home</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleSelectView('bio');
                        setMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-normal transition cursor-pointer ${
                        view === 'bio'
                          ? 'bg-white/[0.08] text-white font-medium'
                          : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      <Leaf size={16} className="text-zinc-300" />
                      <span>BIO</span>
                    </button>

                    <div className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-normal text-zinc-500 opacity-60 cursor-not-allowed select-none" title="Coming soon">
                      <MessageSquare size={16} className="text-zinc-500" />
                      <span>Chats</span>
                    </div>
                    <div className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-normal text-zinc-500 opacity-60 cursor-not-allowed select-none" title="Coming soon">
                      <History size={16} className="text-zinc-500" />
                      <span>History</span>
                    </div>
                    <div className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-normal text-zinc-500 opacity-60 cursor-not-allowed select-none" title="Coming soon">
                      <Library size={16} className="text-zinc-500" />
                      <span>Library</span>
                    </div>
                    <div className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-normal text-zinc-500 opacity-60 cursor-not-allowed select-none" title="Coming soon">
                      <AtSign size={16} className="text-zinc-500" />
                      <span>Mentions</span>
                    </div>
                    <div className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-normal text-zinc-500 opacity-60 cursor-not-allowed select-none" title="Coming soon">
                      <MoreHorizontal size={16} className="text-zinc-500" />
                      <span>More options</span>
                    </div>
                  </div>

                  <div className="h-px bg-white/[0.06] my-2" />

                  <div className="px-1 text-xs">
                    <div className="px-2 pb-1 pt-1 text-xs font-medium text-zinc-500">Recents</div>
                    <ThreadListRoot
                      onClick={(e) => {
                        if (
                          e.target instanceof Element &&
                          e.target.closest('[data-slot="aui_thread-list-item-trigger"]')
                        ) {
                          setView('home');
                          setSettingsOpen(false);
                          setMobileDrawerOpen(false);
                        }
                      }}
                    >
                      <ThreadListItems searchQuery={drawerSearch} />
                    </ThreadListRoot>
                  </div>

                  <div className="h-24" />
                </div>

                {/* Floating Bottom Bar: Gear on Left, New Chat in White on Right */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      handleOpenSettings('keys');
                    }}
                    aria-label="Open Settings"
                    title="Settings"
                    className="pointer-events-auto w-11 h-11 rounded-full bg-[#1c1c22] border border-white/[0.12] text-zinc-300 hover:text-white flex items-center justify-center shadow-xl active:scale-95 transition cursor-pointer"
                  >
                    <Settings size={20} className="text-zinc-300" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      handleNewChat();
                    }}
                    title="New Chat"
                    className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black font-semibold text-xs shadow-xl active:scale-95 transition cursor-pointer"
                  >
                    <SquarePen size={16} className="text-black" />
                    <span>Chat</span>
                  </button>
                </div>
              </aside>
            </div>
          )}

          {/* Mobile & Tablet Workspace Slide-up Sheet */}
          {mobileWorkspaceOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
              <div
                className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity cursor-pointer"
                onClick={() => setMobileWorkspaceOpen(false)}
                aria-label="Close workspace"
              />
              <div className="relative z-10 w-full h-[88vh] bg-[#121216] border-t border-white/[0.1] rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#121216]">
                  <h3 className="text-xs font-semibold text-white">Workspace</h3>
                  <button
                    type="button"
                    onClick={() => setMobileWorkspaceOpen(false)}
                    aria-label="Close workspace"
                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <WorkspacePanel
                    threadId={activeThreadId}
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
                    onClosePanel={() => setMobileWorkspaceOpen(false)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* BIO Mobile FAB Button & Slide-up Sheet */}
          {view === 'bio' && (
            <button
              type="button"
              onClick={() => setMobileBioChatOpen(true)}
              aria-label="Open BIO Assist"
              title="Open BIO Assist"
              className="fixed bottom-6 right-5 z-40 lg:hidden w-14 h-14 rounded-full bg-white text-black hover:bg-zinc-200 active:scale-95 shadow-2xl flex items-center justify-center transition-all cursor-pointer group"
            >
              <MessageSquare size={24} className="transition-transform group-hover:scale-110" />
            </button>
          )}

          {view === 'bio' && mobileBioChatOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
              <div
                className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity cursor-pointer"
                onClick={() => setMobileBioChatOpen(false)}
                aria-label="Close BIO Assist"
              />
              <div className="relative z-10 w-full h-[88vh] h-[88dvh] max-h-[90dvh] bg-[#121216] border-t border-white/[0.1] rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
                <AgentChatCard
                  messages={bioMessages}
                  isWorking={isBioRunning}
                  isMobileSheet={true}
                  onClose={() => setMobileBioChatOpen(false)}
                  composer={
                    <InputDock
                      heroMode={false}
                      maxWidth="100%"
                      onSendMessage={handleSendBioMessage}
                      isWorking={isBioRunning}
                      onStopWorking={handleCancelBio}
                      selectedModel={selectedModel}
                      onSelectModel={setSelectedModel}
                      mode={agentMode}
                      onChangeMode={setAgentMode}
                      activeInterrupt={bioActiveInterrupt}
                      onResolveInterrupt={handleResolveBioInterrupt}
                    />
                  }
                />
              </div>
            </div>
          )}

        </div>
      </AssistantRuntimeProvider>

      {/* 404 Notice Modal for missing/unowned resources */}
      {notFoundNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-[#141417] border border-white/[0.08] rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
              <AlertCircle size={24} />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Chat not found (404)</h2>
            <p className="text-sm text-zinc-400 mb-6">
              {notFoundNotice.message || 'This conversation does not exist, has been deleted, or belongs to another user.'}
            </p>
            <button
              type="button"
              onClick={handleDismissNotFound}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition cursor-pointer"
            >
              Start a new chat
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal (Account & API Keys) */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={handleCloseSettings}
        currentUser={currentUser}
        onLogout={handleLogout}
        initialTab={settingsTab}
        onTabChange={handleSettingsTabChange}
      />
    </div>
  );
}
