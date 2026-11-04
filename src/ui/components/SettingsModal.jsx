import React, { useState, useEffect } from 'react';
import {
  Key,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  MoreVertical,
  Trash2,
  RefreshCw,
  X,
  ExternalLink,
  Shield,
  User,
  Mail,
  Settings
} from 'lucide-react';

export function SettingsModal({ isOpen, onClose, currentUser, onLogout }) {
  const [activeTab, setActiveTab] = useState('keys'); // 'account' | 'keys'
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  // Popups state
  const [editingProvider, setEditingProvider] = useState(null); // 'meta' | 'modal' | null
  const [menuOpenFor, setMenuOpenFor] = useState(null); // 'meta' | 'modal' | null

  // Meta Form Inputs
  const [metaApiKey, setMetaApiKey] = useState('');
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState(null);

  // Modal Form Inputs
  const [modalEndpoint, setModalEndpoint] = useState('');
  const [modalTokenId, setModalTokenId] = useState('');
  const [modalTokenSecret, setModalTokenSecret] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Fetch integrations list from backend
  const loadIntegrations = async () => {
    try {
      setLoading(true);
      setErrorNotice(null);
      const res = await fetch('/api/settings/integrations');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.integrations)) {
          setIntegrations(data.integrations);
        }
      } else {
        setErrorNotice('Failed to load integrations status.');
      }
    } catch {
      setErrorNotice('Network error loading integrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadIntegrations();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const metaIntegration = integrations.find((i) => i.provider === 'meta') || {
    provider: 'meta',
    status: 'not_configured',
    maskedHint: null
  };

  const modalIntegration = integrations.find((i) => i.provider === 'modal') || {
    provider: 'modal',
    status: 'not_configured',
    maskedHint: null
  };

  // Save Meta configuration
  const handleSaveMeta = async (e) => {
    e.preventDefault();
    if (!metaApiKey.trim()) {
      setMetaError('Please provide a valid Meta API key.');
      return;
    }

    setMetaSaving(true);
    setMetaError(null);
    try {
      const res = await fetch('/api/settings/integrations/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: metaApiKey.trim() })
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setMetaApiKey('');
        setEditingProvider(null);
        await loadIntegrations();
      } else {
        setMetaError(data.error || 'Failed to verify Meta API key.');
      }
    } catch (err) {
      setMetaError(`Connection error: ${err.message}`);
    } finally {
      setMetaSaving(false);
    }
  };

  // Save Modal configuration
  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!modalEndpoint.trim()) {
      setModalError('Modal endpoint URL is required.');
      return;
    }
    if (!modalTokenId.trim() || !modalTokenSecret.trim()) {
      setModalError('Both Modal Token ID and Token Secret are required.');
      return;
    }

    setModalSaving(true);
    setModalError(null);
    try {
      const res = await fetch('/api/settings/integrations/modal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointUrl: modalEndpoint.trim(),
          tokenId: modalTokenId.trim(),
          tokenSecret: modalTokenSecret.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setModalEndpoint('');
        setModalTokenId('');
        setModalTokenSecret('');
        setEditingProvider(null);
        await loadIntegrations();
      } else {
        setModalError(data.error || 'Failed to verify Modal endpoint.');
      }
    } catch (err) {
      setModalError(`Connection error: ${err.message}`);
    } finally {
      setModalSaving(false);
    }
  };

  // Disconnect provider
  const handleDisconnect = async (provider) => {
    setMenuOpenFor(null);
    try {
      const res = await fetch(`/api/settings/integrations/${provider}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await loadIntegrations();
      }
    } catch (err) {
      console.error('Failed to disconnect integration:', err);
    }
  };

  // Handle Copy hint to clipboard
  const handleCopyHint = (provider, text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(provider);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative flex flex-col w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh]"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpenFor(null);
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Settings size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Settings</h2>
              <p className="text-xs text-zinc-400">Manage your developer account & billing integrations</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-zinc-800 bg-zinc-950/40 gap-6 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setActiveTab('keys');
              setEditingProvider(null);
            }}
            className={`py-3 transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'keys'
                ? 'border-emerald-500 text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Key size={14} />
            API Keys & Compute
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('account');
              setEditingProvider(null);
            }}
            className={`py-3 transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'account'
                ? 'border-emerald-500 text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <User size={14} />
            Account Details
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorNotice && (
            <div className="flex items-center gap-2 p-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-900/50 rounded-xl">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {/* TAB 1: API KEYS & BILLING INTEGRATIONS */}
          {activeTab === 'keys' && (
            <div className="space-y-5">
              <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/70 rounded-xl flex items-start gap-3">
                <Shield size={17} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-zinc-300">
                  <span className="font-semibold text-zinc-100">User-Funded Developer Billing: </span>
                  Bring your personal Meta API key (and optional Modal credentials). All AI token usage and GPU compute
                  are billed directly to your personal accounts. Secrets are encrypted using AES-256-GCM and never shared.
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-zinc-400 text-xs gap-2">
                  <Loader2 size={16} className="animate-spin text-emerald-400" />
                  <span>Loading configuration status...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 1. Meta AI Configuration */}
                  <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Key size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-100">Meta AI Configuration</span>
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                              Required
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            Powers Muse Wonder, Muse Spark, Muse Image, and Vision transcription
                          </p>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="flex items-center gap-2">
                        {metaIntegration.status === 'connected' ? (
                          <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Connected
                          </span>
                        ) : metaIntegration.status === 'error' ? (
                          <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-rose-400 bg-rose-950/40 border border-rose-900/60 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Error
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-zinc-400 bg-zinc-800/40 border border-zinc-700/60 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                            Not Configured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Masked Key Display or Add Button */}
                    {metaIntegration.status === 'connected' ? (
                      <div className="flex items-center justify-between p-2.5 bg-zinc-900/90 border border-zinc-800/90 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-zinc-400 tracking-wider">
                            {metaIntegration.maskedHint || '...active'}
                          </span>
                          <span className="text-[11px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded">
                            meta
                          </span>
                        </div>

                        <div className="relative flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyHint('meta', metaIntegration.maskedHint)}
                            title="Copy masked hint"
                            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                          >
                            {copiedKey === 'meta' ? (
                              <Check size={14} className="text-emerald-400" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenFor(menuOpenFor === 'meta' ? null : 'meta');
                            }}
                            title="Options"
                            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                          >
                            <MoreVertical size={14} />
                          </button>

                          {menuOpenFor === 'meta' && (
                            <div className="absolute right-0 top-8 z-30 w-36 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenFor(null);
                                  setEditingProvider('meta');
                                  setMetaError(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                              >
                                <RefreshCw size={13} />
                                Replace Key
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDisconnect('meta')}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                              >
                                <Trash2 size={13} />
                                Disconnect
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-zinc-500">No active Meta developer key configured.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProvider('meta');
                            setMetaError(null);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 rounded-lg transition-colors cursor-pointer"
                        >
                          Configure Meta Key
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 2. Modal Compute Configuration */}
                  <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          <Cpu size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-100">Modal Compute Configuration</span>
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 rounded">
                              Optional
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            Serverless GPU compute for Muse Spark Open (816B) vLLM endpoints
                          </p>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="flex items-center gap-2">
                        {modalIntegration.status === 'connected' ? (
                          <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Connected
                          </span>
                        ) : modalIntegration.status === 'error' ? (
                          <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-rose-400 bg-rose-950/40 border border-rose-900/60 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Error
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-zinc-400 bg-zinc-800/40 border border-zinc-700/60 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                            Not Configured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Masked Key Display or Add Button */}
                    {modalIntegration.status === 'connected' ? (
                      <div className="flex items-center justify-between p-2.5 bg-zinc-900/90 border border-zinc-800/90 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-zinc-400 tracking-wider">
                            {modalIntegration.maskedHint || '...active'}
                          </span>
                          <span className="text-[11px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded">
                            modal
                          </span>
                        </div>

                        <div className="relative flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyHint('modal', modalIntegration.maskedHint)}
                            title="Copy masked hint"
                            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                          >
                            {copiedKey === 'modal' ? (
                              <Check size={14} className="text-emerald-400" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenFor(menuOpenFor === 'modal' ? null : 'modal');
                            }}
                            title="Options"
                            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                          >
                            <MoreVertical size={14} />
                          </button>

                          {menuOpenFor === 'modal' && (
                            <div className="absolute right-0 top-8 z-30 w-36 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenFor(null);
                                  setEditingProvider('modal');
                                  setModalError(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                              >
                                <RefreshCw size={13} />
                                Replace Config
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDisconnect('modal')}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                              >
                                <Trash2 size={13} />
                                Disconnect
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-zinc-500">Optional: Connect personal Modal token for GPU compute.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProvider('modal');
                            setModalError(null);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700 rounded-lg transition-colors cursor-pointer"
                        >
                          Configure Modal
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACCOUNT DETAILS */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold text-sm">
                    {currentUser?.name?.[0]?.toUpperCase() || currentUser?.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-zinc-100">
                      {currentUser?.name || 'Authorized User'}
                    </h3>
                    <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                      <Mail size={12} />
                      {currentUser?.email || 'user@dotta.ai'}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Role</span>
                    <span className="text-zinc-200 capitalize font-medium">{currentUser?.role || 'Developer'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Session Status</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 size={12} /> Authenticated
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-zinc-950/50 border border-zinc-800/80 rounded-xl space-y-2">
                <h4 className="text-xs font-medium text-zinc-200">Security Architecture</h4>
                <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
                  <li>Row-Level Security (RLS) restricts access to your own private records.</li>
                  <li>All credential secrets encrypted with AES-256-GCM.</li>
                  <li>Per-run sandbox isolation with network allowlisting.</li>
                </ul>
              </div>

              {onLogout && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onLogout}
                    className="px-4 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/40 rounded-xl transition-colors cursor-pointer"
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* POPUP 1: Meta AI Key Dialog */}
        {editingProvider === 'meta' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <Key size={16} className="text-blue-400" />
                  <span>Meta AI Configuration</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Enter your personal Meta API key. A tiny 1-token test probe will verify access before saving.
              </p>

              {metaError && (
                <div className="p-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-xl flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                  <span>{metaError}</span>
                </div>
              )}

              <form onSubmit={handleSaveMeta} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300 block">
                    Meta API Key
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={metaApiKey}
                    onChange={(e) => setMetaApiKey(e.target.value)}
                    placeholder="Enter Meta API Key (e.g. sk-meta-...)"
                    disabled={metaSaving}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/70"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingProvider(null)}
                    disabled={metaSaving}
                    className="px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={metaSaving || !metaApiKey.trim()}
                    className="px-4 py-1.5 text-xs font-medium text-zinc-900 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    {metaSaving && <Loader2 size={13} className="animate-spin" />}
                    <span>{metaSaving ? 'Verifying...' : 'Save'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* POPUP 2: Modal Compute Dialog */}
        {editingProvider === 'modal' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <Cpu size={16} className="text-indigo-400" />
                  <span>Modal Compute Configuration</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Configure your serverless Modal vLLM web endpoint for Muse Spark Open (816B).
              </p>

              {modalError && (
                <div className="p-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-xl flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleSaveModal} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300 block">
                    Modal Endpoint URL (HTTPS)
                  </label>
                  <input
                    type="url"
                    value={modalEndpoint}
                    onChange={(e) => setModalEndpoint(e.target.value)}
                    placeholder="https://your-workspace--muse-spark-open.modal.run"
                    disabled={modalSaving}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/70"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300 block">
                    Modal Token ID
                  </label>
                  <input
                    type="text"
                    value={modalTokenId}
                    onChange={(e) => setModalTokenId(e.target.value)}
                    placeholder="ak-..."
                    disabled={modalSaving}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/70"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300 block">
                    Modal Token Secret
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={modalTokenSecret}
                    onChange={(e) => setModalTokenSecret(e.target.value)}
                    placeholder="as-..."
                    disabled={modalSaving}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/70"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingProvider(null)}
                    disabled={modalSaving}
                    className="px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSaving || !modalEndpoint.trim() || !modalTokenId.trim() || !modalTokenSecret.trim()}
                    className="px-4 py-1.5 text-xs font-medium text-zinc-900 bg-indigo-400 hover:bg-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    {modalSaving && <Loader2 size={13} className="animate-spin" />}
                    <span>{modalSaving ? 'Verifying...' : 'Save'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsModal;
