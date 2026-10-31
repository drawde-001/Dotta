import React, { useEffect, useState } from 'react';
import {
  Bell,
  Search,
  PanelLeftClose,
  ChevronDown,
  Folder,
  SquarePen
} from 'lucide-react';
import {
  ThreadListRoot,
  ThreadListNew,
  ThreadListSearch,
  ThreadListItems
} from './assistant-ui/elements/thread-list.aui';
import { getUserId } from '@/lib/user';

/**
 * Threads panel in the preview design: Omni Agent header, New chat,
 * Projects (BIO), Recents (real threads from the thread list runtime).
 */
export function ThreadsPanel({ onCollapse, onOpenBio }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [bioLine, setBioLine] = useState('Alex Morgan · Default profile');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/bio', {
          headers: { 'x-user-id': getUserId() }
        });
        const data = await res.json().catch(() => null);
        const active =
          data?.profiles?.find((p) => p.isActive) || data?.profiles?.[0];
        if (active) {
          const name = active.fields?.fullName || 'BIO';
          setBioLine(`${name} · ${active.isActive ? 'Default profile' : active.name}`);
        }
      } catch {}
    })();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pb-1 pt-4">
        <div className="flex items-center gap-1.5 px-1 py-1 text-[15px] font-semibold tracking-tight text-zinc-100">
          Omni Agent
          <ChevronDown size={14} className="text-zinc-500" />
        </div>
        <div className="flex items-center gap-0.5">
          <span
            aria-hidden="true"
            title="Notifications"
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-zinc-500"
          >
            <Bell size={16} />
          </span>
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            aria-label="Search chats"
            aria-pressed={searchOpen}
            title="Search chats"
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-white/[0.06] hover:text-zinc-200 ${
              searchOpen ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-500'
            }`}
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse threads panel"
            title="Collapse panel"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      <ThreadListRoot className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5 pt-1.5">
        <ThreadListNew className="h-auto w-full justify-start gap-2.5 rounded-xl px-2 py-2 text-[13px] font-normal text-zinc-100 hover:bg-white/[0.06]">
          <SquarePen size={16} className="shrink-0 text-zinc-500" />
          New chat
        </ThreadListNew>

        {searchOpen && (
          <ThreadListSearch value={search} onValueChange={setSearch} autoFocus />
        )}

        <div className="px-2 pb-1 pt-4 text-xs font-medium text-zinc-500">Projects</div>
        <button
          type="button"
          onClick={onOpenBio}
          className="flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
        >
          <Folder size={16} className="mt-0.5 shrink-0 text-zinc-500" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-zinc-100">
              Agent Platform Launch
            </span>
            <span className="block truncate text-[11px] text-zinc-500">{bioLine}</span>
          </span>
        </button>

        <div className="px-2 pb-1 pt-4 text-xs font-medium text-zinc-500">Recents</div>
        <ThreadListItems searchQuery={search} />
      </ThreadListRoot>
    </div>
  );
}

export default ThreadsPanel;
