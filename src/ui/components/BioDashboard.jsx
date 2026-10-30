import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  ChevronDown,
  Plus,
  Shield,
  Bookmark,
  MoreHorizontal,
  Camera,
  Github,
  Linkedin,
  Twitter,
  Instagram,
  Globe,
  FileText,
  Check,
  X,
  Pencil,
  Circle,
  Image as ImageIcon,
  Mic,
  Video,
  Leaf,
  Lock,
  CornerDownLeft,
  Trash2,
  Upload
} from 'lucide-react';
import { getUserId } from '@/lib/user';

async function bioApi(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'x-user-id': getUserId(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes >= 1000000) return `${(bytes / 1000000).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5">
      <span className="text-[11px] text-zinc-400">{label}:</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-8 rounded-full transition-colors ${
          checked ? 'bg-zinc-200' : 'bg-zinc-800'
        }`}
      >
        <span
          className={`absolute top-[2px] h-3 w-3 rounded-full transition-all ${
            checked ? 'left-[18px] bg-zinc-950' : 'left-[2px] bg-zinc-400'
          }`}
        />
      </button>
    </label>
  );
}

function Editable({ value, onSave, multiline = false, placeholder = 'Not set', textClassName = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  useEffect(() => {
    if (!editing) setDraft(value || '');
  }, [value, editing]);

  const save = async () => {
    await onSave(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="group flex items-start justify-between gap-2">
        <div className={`min-w-0 ${textClassName}`}>
          {value ? (
            value
          ) : (
            <span className="italic text-zinc-500">{placeholder}</span>
          )}
        </div>
        <button
          type="button"
          aria-label="Edit"
          onClick={() => setEditing(true)}
          className="shrink-0 text-zinc-500 opacity-0 transition-opacity hover:text-zinc-100 group-hover:opacity-100"
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500';
  return (
    <div className="flex flex-col gap-2">
      {multiline ? (
        <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className={inputCls} />
      ) : (
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} className={inputCls} />
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={save}
          className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-white"
        >
          <Check size={13} /> Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const ENTRY_ICONS = { document: FileText, image: ImageIcon, audio: Mic, video: Video };

export function BioDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState({ fullName: '', headline: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [entryModal, setEntryModal] = useState(false);
  const [entryForm, setEntryForm] = useState({ name: '', type: 'document', description: '' });
  const [entryFile, setEntryFile] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const photoInputRef = useRef(null);
  const cvInputRef = useRef(null);

  const profile = profiles.find((p) => p.id === activeId) || profiles[0] || null;
  const fields = profile?.fields || {};
  const grants = profile?.grants || { read: false, write: false };
  const entries = profile?.entries || [];

  const load = useCallback(async () => {
    try {
      const data = await bioApi('/api/bio');
      setProfiles(data.profiles || []);
      setActiveId(data.activeProfileId || data.profiles?.[0]?.id || null);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load BIO');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve profile photo (sandbox path -> blob URL; absolute paths direct)
  useEffect(() => {
    let revoked = '';
    const photo = fields.photo || '';
    if (!photo) {
      setPhotoUrl('');
      return;
    }
    if (photo.startsWith('/') || photo.startsWith('http')) {
      setPhotoUrl(photo);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/workspace/raw?path=${encodeURIComponent(photo)}`, {
          headers: { 'x-user-id': getUserId() }
        });
        if (!res.ok) return;
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        setPhotoUrl(revoked);
      } catch {}
    })();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [fields.photo]);

  const patchLocalProfile = (updated) => {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const saveField = async (fieldId, value) => {
    if (!profile) return;
    patchLocalProfile({ ...profile, fields: { ...profile.fields, [fieldId]: value } });
    try {
      const data = await bioApi('/api/bio/fields', {
        method: 'PUT',
        body: JSON.stringify({ profileId: profile.id, fieldId, value })
      });
      patchLocalProfile(data.profile);
    } catch {
      load();
    }
  };

  const setGrant = async (key, value) => {
    if (!profile) return;
    const next = { ...grants, [key]: value };
    patchLocalProfile({ ...profile, grants: next });
    try {
      const data = await bioApi('/api/bio/profile', {
        method: 'PATCH',
        body: JSON.stringify({ profileId: profile.id, grants: next })
      });
      patchLocalProfile(data.profile);
    } catch {
      load();
    }
  };

  const activateProfile = async (id) => {
    setActiveId(id);
    try {
      await bioApi(`/api/bio/profiles/${encodeURIComponent(id)}/activate`, { method: 'POST' });
      setProfiles((prev) => prev.map((p) => ({ ...p, isActive: p.id === id })));
    } catch {
      load();
    }
  };

  const createProfile = async () => {
    try {
      const data = await bioApi('/api/bio/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: `Profile ${profiles.length + 1}` })
      });
      await load();
      if (data.profile?.id) activateProfile(data.profile.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveRename = async () => {
    if (!profile || !renameDraft.trim()) return;
    try {
      const data = await bioApi('/api/bio/profile', {
        method: 'PATCH',
        body: JSON.stringify({ profileId: profile.id, name: renameDraft.trim() })
      });
      patchLocalProfile(data.profile);
      setRenaming(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteProfile = async () => {
    if (!profile) return;
    try {
      await bioApi(`/api/bio/profiles/${encodeURIComponent(profile.id)}`, { method: 'DELETE' });
      setConfirmDelete(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;
    try {
      const dataBase64 = await fileToBase64(file);
      const data = await bioApi('/api/bio/photo', {
        method: 'POST',
        body: JSON.stringify({
          profileId: profile.id,
          file: { name: file.name, mime: file.type, dataBase64 }
        })
      });
      patchLocalProfile(data.profile);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCvUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;
    try {
      const dataBase64 = await fileToBase64(file);
      const data = await bioApi('/api/bio/cv', {
        method: 'POST',
        body: JSON.stringify({
          profileId: profile.id,
          file: { name: file.name, mime: file.type, dataBase64 }
        })
      });
      patchLocalProfile(data.profile);
    } catch (err) {
      setError(err.message);
    }
  };

  const addEntry = async () => {
    if (!profile || !entryForm.name.trim() || !entryForm.description.trim()) return;
    try {
      let file = null;
      if (entryFile) {
        file = {
          name: entryFile.name,
          mime: entryFile.type,
          dataBase64: await fileToBase64(entryFile)
        };
      }
      const data = await bioApi('/api/bio/entries', {
        method: 'POST',
        body: JSON.stringify({ profileId: profile.id, ...entryForm, file })
      });
      patchLocalProfile({ ...profile, entries: [...entries, data.entry] });
      setEntryModal(false);
      setEntryForm({ name: '', type: 'document', description: '' });
      setEntryFile(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteEntry = async (entryId) => {
    if (!profile) return;
    try {
      const data = await bioApi(
        `/api/bio/entries/${encodeURIComponent(entryId)}?profileId=${encodeURIComponent(profile.id)}`,
        { method: 'DELETE' }
      );
      patchLocalProfile({ ...profile, entries: data.entries });
    } catch (err) {
      setError(err.message);
    }
  };

  const patchEntry = async (entryId, patch) => {
    if (!profile) return;
    try {
      const data = await bioApi(`/api/bio/entries/${encodeURIComponent(entryId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ profileId: profile.id, ...patch })
      });
      patchLocalProfile({
        ...profile,
        entries: entries.map((e) => (e.id === entryId ? data.entry : e))
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const notes = Array.isArray(fields.notes) ? fields.notes : [];
  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    saveField('notes', [...notes, text]);
    setNoteDraft('');
  };

  const socials = fields.socialLinks || {};
  const socialList = [
    { key: 'github', Icon: Github, label: 'GitHub' },
    { key: 'linkedin', Icon: Linkedin, label: 'LinkedIn' },
    { key: 'x', Icon: Twitter, label: 'X (Twitter)' },
    { key: 'instagram', Icon: Instagram, label: 'Instagram' }
  ].filter((s) => socials[s.key]);

  const rootRef = useRef(null);
  const rightGroupRef = useRef(null);

  // Desktop scroll logic: once the last card of the right group is visible,
  // the group locks in place and only the long basic-info column keeps scrolling.
  useEffect(() => {
    const group = rightGroupRef.current;
    const root = rootRef.current;
    if (!group || !root) return;
    const scroller = root.parentElement;
    if (!scroller) return;
    const update = () => {
      if (window.innerWidth < 1024) {
        group.style.top = '';
        return;
      }
      const visible = scroller.clientHeight;
      const h = group.offsetHeight;
      group.style.top = h + 28 > visible ? `${visible - h - 28}px` : '1.75rem';
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const timer = setTimeout(update, 100);
    return () => {
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      clearTimeout(timer);
    };
  }, [loading, profile?.id]);

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading BIO...</div>;
  }
  if (!profile) {
    return (
      <div className="p-6 text-sm text-zinc-400">
        {error || 'No BIO profile yet.'}
      </div>
    );
  }

  const inputCls =
    'w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600';

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      {/* Global Header: BIO */}
      <header className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-zinc-100">BIO</h1>
              <span className="rounded-full border border-zinc-700/50 bg-zinc-800/90 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                User-Owned Store
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              More context about you, so your agent can do more on your behalf
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
            title="Preferences"
          >
            <SlidersHorizontal size={14} />
            <span>Preferences</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left column: profile */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.04] bg-[#141417] p-3.5 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-zinc-300">Profile:</span>
                {renaming ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none"
                    />
                    <button type="button" onClick={saveRename} className="rounded-lg bg-zinc-100 px-2 py-1.5 text-zinc-950" aria-label="Save name">
                      <Check size={13} />
                    </button>
                    <button type="button" onClick={() => setRenaming(false)} className="rounded-lg bg-zinc-800 px-2 py-1.5 text-zinc-300" aria-label="Cancel rename">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative min-w-0 flex-1">
                      <select
                        value={profile.id}
                        onChange={(e) => activateProfile(e.target.value)}
                        className="w-full appearance-none truncate rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 pr-7 text-xs font-medium text-zinc-100 focus:outline-none"
                      >
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.isActive ? ' (Active)' : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-2.5 text-zinc-400" />
                    </div>
                    <button
                      type="button"
                      title="Rename profile"
                      onClick={() => {
                        setRenameDraft(profile.name);
                        setRenaming(true);
                      }}
                      className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-zinc-100"
                    >
                      <Pencil size={13} />
                    </button>
                    {confirmDelete ? (
                      <button
                        type="button"
                        onClick={deleteProfile}
                        className="shrink-0 rounded-lg bg-red-500/90 px-2 py-1.5 text-[11px] font-medium text-white"
                      >
                        Confirm delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Delete profile"
                        disabled={profiles.length <= 1}
                        onClick={() => setConfirmDelete(true)}
                        className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={createProfile}
                className="flex shrink-0 items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                title="Create New Profile"
              >
                <Plus size={14} />
                <span>New</span>
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-2 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Shield size={14} className="text-zinc-300" />
                <span className="text-[11px] font-medium text-zinc-300">Agent Access:</span>
              </div>
              <div className="flex items-center gap-3">
                <Toggle label="Read" checked={!!grants.read} onChange={(v) => setGrant('read', v)} />
                <Toggle label="Write" checked={!!grants.write} onChange={(v) => setGrant('write', v)} />
              </div>
            </div>
            <p className="-mt-1 text-[11px] text-zinc-500">
              {!grants.read && !grants.write
                ? 'Agent access is off. The agent cannot read or save to this profile.'
                : grants.read && !grants.write
                  ? 'The agent can read this profile, but cannot save to it.'
                  : !grants.read && grants.write
                    ? 'Save proposals are on, but read is off. Turn read on so the agent can check what is already saved.'
                    : 'The agent can read this profile. Every save still needs your approval.'}
            </p>
          </div>

          <article className="relative w-full overflow-hidden rounded-3xl border border-white/[0.04] bg-[#141417] shadow-xl">
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-zinc-300 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white" title="Bookmark profile">
                <Bookmark size={16} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-zinc-300 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white" title="Profile options">
                <MoreHorizontal size={16} />
              </button>
            </div>

            <div className="group relative flex h-[390px] w-full items-center justify-center overflow-hidden bg-zinc-950 sm:h-[420px]">
              {photoUrl ? (
                <img src={photoUrl} alt="Profile Photo" className="h-full w-full object-cover object-center" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-950 text-5xl font-semibold text-zinc-600">
                  {(fields.fullName || 'B').slice(0, 1)}
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-t from-[#141417] via-[#141417]/80 to-transparent" />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-xl bg-black/50 px-2.5 py-1.5 text-[11px] text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/70"
              >
                <Camera size={14} />
                <span>Change Photo</span>
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              <div className="absolute inset-x-0 bottom-4 left-5 right-5 z-20 flex flex-col gap-2">
                <div
                  className="group/name cursor-pointer"
                  title="Edit name and headline"
                  onClick={() => {
                    setNameDraft({
                      fullName: fields.fullName || '',
                      headline: fields.headline || ''
                    });
                    setEditingName(true);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-2xl font-bold tracking-tight text-white drop-shadow-md">
                      {fields.fullName || 'Your name'}
                    </h2>
                    <Pencil
                      size={14}
                      className="shrink-0 text-zinc-300 opacity-0 transition-opacity group-hover/name:opacity-100"
                    />
                  </div>
                  <p className="mt-0.5 truncate text-xs font-medium tracking-wide text-zinc-300 drop-shadow">
                    {fields.headline || 'Add your headline'}
                  </p>
                </div>
                {socialList.length > 0 && (
                  <div className="mt-1 flex items-center gap-2">
                    {socialList.map(({ key, Icon, label }) => (
                      <a
                        key={key}
                        href={socials[key]}
                        target="_blank"
                        rel="noreferrer"
                        title={label}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-zinc-200 backdrop-blur-md transition hover:bg-white/20"
                      >
                        <Icon size={14} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5 text-sm">
              {editingName && (
                <div className="flex flex-col gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-3">
                  <input
                    value={nameDraft.fullName}
                    onChange={(e) => setNameDraft((d) => ({ ...d, fullName: e.target.value }))}
                    placeholder="Full name"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                  />
                  <input
                    value={nameDraft.headline}
                    onChange={(e) => setNameDraft((d) => ({ ...d, headline: e.target.value }))}
                    placeholder="Headline"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await saveField('fullName', nameDraft.fullName);
                        await saveField('headline', nameDraft.headline);
                        setEditingName(false);
                      }}
                      className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-white"
                    >
                      <Check size={13} /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Full name &amp; headline</span>
                <Editable
                  value={fields.fullName}
                  placeholder="Add full name"
                  onSave={(v) => saveField('fullName', v)}
                  textClassName="text-sm font-medium text-zinc-100"
                />
                <Editable
                  value={fields.headline}
                  placeholder="Add headline"
                  onSave={(v) => saveField('headline', v)}
                  textClassName="text-xs text-zinc-400"
                />
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Role</span>
                <Editable value={fields.role} placeholder="Add your role" onSave={(v) => saveField('role', v)} textClassName="text-xs font-medium text-zinc-100 sm:text-sm" />
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Locations</span>
                <div className="flex flex-col gap-1 text-xs text-zinc-200">
                  <div className="flex items-baseline gap-2">
                    <span className="w-28 shrink-0 font-mono text-zinc-400">Residence:</span>
                    <div className="min-w-0 flex-1">
                      <Editable value={fields.residence} placeholder="Add residence" onSave={(v) => saveField('residence', v)} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-28 shrink-0 font-mono text-zinc-400">State of Origin:</span>
                    <div className="min-w-0 flex-1">
                      <Editable value={fields.stateOfOrigin} placeholder="Add state of origin" onSave={(v) => saveField('stateOfOrigin', v)} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-28 shrink-0 font-mono text-zinc-400">Address:</span>
                    <div className="min-w-0 flex-1">
                      <Editable value={fields.address} placeholder="Missing (click to add)" onSave={(v) => saveField('address', v)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Social links</span>
                <div className="flex flex-col gap-1.5 text-xs">
                  {['github', 'linkedin', 'x', 'instagram'].map((key) => (
                    <div key={key} className="flex items-baseline gap-2">
                      <span className="w-28 shrink-0 font-mono capitalize text-zinc-400">{key}:</span>
                      <div className="min-w-0 flex-1">
                        <Editable
                          value={socials[key] || ''}
                          placeholder="Add link"
                          onSave={(v) => saveField('socialLinks', { ...socials, [key]: v })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Personal Web</span>
                <Editable value={fields.website} placeholder="Add personal website" onSave={(v) => saveField('website', v)} textClassName="font-mono text-xs text-zinc-200" />
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">CV / Resume</span>
                  <label className="flex cursor-pointer items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100">
                    <Upload size={12} /> Upload / Replace
                    <input ref={cvInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" className="hidden" onChange={handleCvUpload} />
                  </label>
                </div>
                <div className="mt-0.5 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <FileText size={16} className="shrink-0 text-zinc-400" />
                    <span className="truncate font-medium text-zinc-200">
                      {fields.cv?.name || 'No CV uploaded yet'}
                    </span>
                    {fields.cv?.size ? (
                      <span className="shrink-0 font-mono text-[10px] text-zinc-500">({formatSize(fields.cv.size)})</span>
                    ) : null}
                  </div>
                  {fields.cv?.name && (
                    <span className="shrink-0 rounded border border-zinc-700/60 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                      Verified for Agent
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Interests</span>
                <Editable
                  value={Array.isArray(fields.interests) ? fields.interests.join(', ') : ''}
                  placeholder="Add interests, separated by commas"
                  onSave={(v) => saveField('interests', v.split(',').map((s) => s.trim()).filter(Boolean))}
                />
                {Array.isArray(fields.interests) && fields.interests.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {fields.interests.map((tag) => (
                      <span key={tag} className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-300">Work history</span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {Array.isArray(fields.workHistory) ? fields.workHistory.length : 0} roles
                    </span>
                  </div>
                </div>
                <Editable
                  multiline
                  value={(Array.isArray(fields.workHistory) ? fields.workHistory : [])
                    .map((r) => `${r.period} | ${r.title} | ${r.meta}`)
                    .join('\n')}
                  placeholder={'One role per line: period | title | company · location'}
                  onSave={(v) =>
                    saveField(
                      'workHistory',
                      v
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((l) => {
                          const [period = '', title = '', meta = ''] = l.split('|').map((s) => s.trim());
                          return { period, title: title || l, meta };
                        })
                    )
                  }
                />
                <div className="flex flex-col">
                  {(Array.isArray(fields.workHistory) ? fields.workHistory : []).map((role, idx) => (
                    <div key={idx} className="flex items-start gap-4 border-t border-white/[0.04] py-2.5">
                      <div className="w-24 flex-none pt-0.5 font-mono text-[11px] text-zinc-500 sm:w-28">{role.period}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-zinc-100 sm:text-[13px]">{role.title}</div>
                        <div className="text-[11px] text-zinc-400">{role.meta}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Personal Dos &amp; Don&apos;ts</span>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                    <span className="mb-1 block font-medium text-zinc-200">Personal Dos:</span>
                    <Editable multiline value={fields.dos} placeholder="Add your dos" onSave={(v) => saveField('dos', v)} textClassName="leading-relaxed text-zinc-400" />
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                    <span className="mb-1 block font-medium text-zinc-200">Personal Don&apos;ts:</span>
                    <Editable multiline value={fields.donts} placeholder="Add your don'ts" onSave={(v) => saveField('donts', v)} textClassName="leading-relaxed text-zinc-400" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-zinc-400">Hobby &amp; Ideas</span>
                <span className="text-[11px] font-medium text-zinc-500">Hobby projects</span>
                <Editable multiline value={fields.hobbyProjects} placeholder="Add hobby projects" onSave={(v) => saveField('hobbyProjects', v)} textClassName="text-xs text-zinc-300" />
                <span className="mt-1 text-[11px] font-medium text-zinc-500">Ideas</span>
                <Editable multiline value={fields.ideas} placeholder="Add ideas" onSave={(v) => saveField('ideas', v)} textClassName="text-xs text-zinc-300" />
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-200">My notes</span>
                  <span className="font-mono text-[11px] text-zinc-500">Saved to BIO</span>
                </div>
                <div className="flex flex-col gap-2">
                  {notes.map((note, idx) => (
                    <div key={idx} className="group/note flex items-start justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-300">
                      <span>{note}</span>
                      <button
                        type="button"
                        aria-label="Delete note"
                        onClick={() => saveField('notes', notes.filter((_, i) => i !== idx))}
                        className="text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover/note:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addNote();
                      }
                    }}
                    placeholder="Type new note and press enter..."
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                  />
                  <button type="button" aria-label="Add note" onClick={addNote} className="absolute right-2.5 top-2 text-zinc-400 hover:text-white">
                    <CornerDownLeft size={14} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-semibold text-zinc-200">Biography</span>
                <Editable multiline value={fields.background} placeholder="Add your biography" onSave={(v) => saveField('background', v)} textClassName="text-xs leading-relaxed text-zinc-300" />
              </div>
            </div>
          </article>
        </div>

        {/* Right column */}
        <div
          ref={rightGroupRef}
          className="flex flex-col gap-6 self-start lg:sticky lg:col-span-7 lg:grid lg:grid-cols-12"
        >
          <div className="flex flex-col gap-6 lg:col-span-7">
            <section aria-label="Profile strength" className="flex flex-col gap-4 rounded-3xl border border-white/[0.04] bg-[#141417] p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <h2 className="text-sm font-semibold tracking-tight text-white">Profile strength</h2>
                <span className="font-mono text-xs text-zinc-400">7 of 8 core</span>
              </div>
              <div className="flex items-center gap-6 py-1">
                <svg role="img" aria-label="Profile 88 percent complete" width="96" height="96" viewBox="0 0 104 104" className="shrink-0">
                  <circle cx="52" cy="52" r="44" fill="none" stroke="#27272a" strokeWidth="8" />
                  <circle cx="52" cy="52" r="44" fill="none" stroke="#e4e4e7" strokeWidth="8" strokeLinecap="round" strokeDasharray="243.3 276.5" transform="rotate(-90 52 52)" />
                  <text x="52" y="58" textAnchor="middle" fill="#f4f4f5" fontSize="22" fontWeight="600" fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
                    88%
                  </text>
                </svg>
                <ul className="flex flex-col gap-2 text-xs text-zinc-300">
                  <li className="flex items-center gap-2"><Check size={14} className="text-zinc-300" /><span>Photo and name</span></li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-zinc-300" /><span>CV uploaded</span></li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-zinc-300" /><span>Personal website</span></li>
                  <li className="flex items-center gap-2 text-zinc-400"><Circle size={12} className="text-zinc-500" /><span>Address {fields.address ? 'added' : 'missing'}</span></li>
                </ul>
              </div>
              {!fields.address && (
                <p className="text-[11px] text-zinc-500">Add your address from the Locations section on the profile card.</p>
              )}
            </section>

            <section className="flex flex-col gap-5 rounded-3xl border border-white/[0.04] bg-[#141417] p-6 shadow-xl">
              <div className="flex flex-col items-start justify-between gap-4 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold tracking-tight text-white">Additional bio</h3>
                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-xs text-zinc-400">
                      {entries.length} entries
                    </span>
                  </div>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-400">
                    Supplemental assets, portfolio media, certificates, and recordings that give the
                    agent rich verified context during applications.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEntryModal(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 py-2 text-xs font-medium text-zinc-950 shadow-md transition-all hover:bg-white"
                >
                  <Plus size={14} />
                  <span>Add data</span>
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {entries.map((entry) => {
                  const Icon = ENTRY_ICONS[entry.type] || FileText;
                  return (
                    <div key={entry.id} className="group flex flex-col justify-between gap-2.5 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-3.5 transition-colors hover:bg-zinc-900/90">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300">
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="truncate text-xs font-semibold text-zinc-100">{entry.name}</h4>
                            <span className="rounded border border-zinc-700/50 bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-400">
                              {entry.type}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{entry.description}</p>
                        </div>
                        <button
                          type="button"
                          aria-label="Delete entry"
                          onClick={() => deleteEntry(entry.id)}
                          className="shrink-0 text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/[0.04] pt-2 font-mono text-[11px] text-zinc-500">
                        <span>
                          {entry.file?.name
                            ? `${entry.file.name}${entry.file.size ? ` · ${formatSize(entry.file.size)}` : ''}`
                            : entry.type === 'audio' || entry.type === 'video'
                              ? entry.agentReadable
                                ? 'Agent access granted by you'
                                : 'Stored only · Agent cannot read yet'
                              : 'No file attached'}
                        </span>
                      </div>
                      {(entry.type === 'audio' || entry.type === 'video') && (
                        <div className="flex items-center justify-between border-t border-white/[0.04] pt-2">
                          <span className="text-[11px] text-zinc-500">
                            Agent can read this {entry.type}
                          </span>
                          <Toggle
                            label="Grant"
                            checked={!!entry.agentReadable}
                            onChange={(v) => patchEntry(entry.id, { agentReadable: v })}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {entries.length === 0 && (
                  <p className="text-xs text-zinc-500">No additional data yet. Use Add data to store documents, images, audio or video for the agent.</p>
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-5">
            <section aria-label="Recent agent activity" className="flex flex-col gap-4 rounded-3xl border border-white/[0.04] bg-[#141417] p-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <h2 className="text-sm font-semibold tracking-tight text-white">Recent agent activity</h2>
                <span className="font-mono text-[10px] text-zinc-400">Field names only</span>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                    <Leaf size={14} />
                  </div>
                  <span className="text-xs font-medium leading-snug text-zinc-100">Checked bio for job application</span>
                </div>
                <div className="pl-8 text-[11px] text-zinc-500">Today, 02:41 · Read 4 fields</div>
                <div className="flex flex-wrap gap-1.5 pl-8 pt-1">
                  {['Role', 'Residence', 'CV', 'Website'].map((field) => (
                    <span key={field} className="rounded-full border border-zinc-700/50 bg-zinc-800/80 px-2.5 py-0.5 font-mono text-[11px] text-zinc-300">
                      {field}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                    <Check size={14} />
                  </div>
                  <span className="text-xs font-medium leading-snug text-zinc-100">Save approved by you</span>
                </div>
                <div className="pl-8 text-[11px] text-zinc-500">Today, 02:43 · Notice period proposed</div>
              </div>
              <div className="mt-1 flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <Lock size={16} className="mt-0.5 shrink-0 text-zinc-400" />
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  <strong className="text-zinc-200">Zero-value leak guarantee:</strong> Audit logs
                  record field IDs only, never values. Agent reads index first without touching data.
                </p>
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-3xl border border-white/[0.04] bg-[#141417] p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Agent Write Guard</span>
                <span className="rounded border border-zinc-700/60 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">Enforced</span>
              </div>
              <p className="text-xs leading-snug text-zinc-400">
                Every write proposal requires human confirmation via Approval Card. No web page or
                unconfirmed answer can mutate your profile.
              </p>
              <div className="flex items-center justify-between border-t border-white/[0.04] pt-2 font-mono text-[11px] text-zinc-500">
                <span>Fail-closed policy</span>
                <span className="text-zinc-300">Deny on default</span>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Add data modal (name -> type -> description, in that order) */}
      {entryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-zinc-800 bg-[#141417] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-semibold text-white">Add Additional Bio Data</h3>
              <button type="button" onClick={() => setEntryModal(false)} className="text-zinc-400 hover:text-white" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-zinc-300">1. Data Name</label>
                <input
                  value={entryForm.name}
                  onChange={(e) => setEntryForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. AWS Solution Architect Certificate"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-zinc-300">2. Data Type</label>
                <select
                  value={entryForm.type}
                  onChange={(e) => setEntryForm((f) => ({ ...f, type: e.target.value }))}
                  className={inputCls}
                >
                  <option value="document">Document (.pdf, .docx, .txt)</option>
                  <option value="image">Image (.png, .jpg, .webp)</option>
                  <option value="audio">Audio (.mp3, .wav, .m4a)</option>
                  <option value="video">Video (.mp4, .webm)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-zinc-300">3. Data Description</label>
                <textarea
                  rows={3}
                  value={entryForm.description}
                  onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the contents and when the agent should use this data..."
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-zinc-300">File Attachment (Optional)</label>
                <label className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center hover:bg-zinc-900">
                  <Upload size={18} className="mx-auto mb-1 text-zinc-400" />
                  <p className="text-[11px] text-zinc-300">{entryFile ? entryFile.name : 'Click to attach file'}</p>
                  <p className="font-mono text-[10px] text-zinc-500">Max 15MB · Stored in your sandbox</p>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setEntryFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] pt-2">
                <button type="button" onClick={() => setEntryModal(false)} className="rounded-xl bg-zinc-800 px-4 py-2 text-zinc-300 hover:bg-zinc-700">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addEntry}
                  disabled={!entryForm.name.trim() || !entryForm.description.trim()}
                  className="rounded-xl bg-zinc-100 px-4 py-2 font-medium text-zinc-950 hover:bg-white disabled:opacity-40"
                >
                  Save to BIO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BioDashboard;
