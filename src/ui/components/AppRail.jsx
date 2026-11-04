import React from 'react';
import {
  Home,
  MessageSquare,
  History,
  Library,
  AtSign,
  MoreHorizontal,
  Settings,
  LogOut
} from 'lucide-react';

function LeafMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="-5.33 -5.33 74.67 74.67"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path
        fill="#070807"
        d="M56,28c0,11.047-8.953,20-20,20H16V28c0-11.047,8.953-20,20-20h20V28z"
      />
      <path
        fill="#17deb3"
        d="M36,0C20.535,0,8,12.535,8,28v22.344l-6.828,6.828c-1.562,1.562-1.562,4.094,0,5.656C1.953,63.609,2.977,64,4,64s2.047-0.391,2.828-1.172L13.656,56H36c15.465,0,28-12.535,28-28V0H36z M56,28 c0,11.047-8.953,20-20,20H16V28c0-11.047,8.953-20,20-20h20V28z"
      />
      <path
        fill="#17deb3"
        d="M32,20c0-2.211-1.789-4-4-4s-4,1.789-4,4v14.344l-2.828,2.828c-1.562,1.562-1.562,4.094,0,5.656C21.953,43.609,22.977,44,24,44s2.047-0.391,2.828-1.172l2.824-2.824H44c2.211,0,4-1.789,4-4s-1.789-4-4-4h-6.348l13.176-13.176 c1.562-1.562,1.562-4.094,0-5.656s-4.094-1.562-5.656,0L32,26.344V20z"
      />
    </svg>
  );
}

const DECORATIVE = [
  { label: 'Chats', Icon: MessageSquare },
  { label: 'History', Icon: History },
  { label: 'Library', Icon: Library },
  { label: 'Mentions', Icon: AtSign },
  { label: 'More options', Icon: MoreHorizontal }
];

export function AppRail({ view, onSelectView, currentUser, onLogout, onOpenSettings }) {
  const tabBase =
    'flex h-[38px] w-[38px] items-center justify-center rounded-xl transition-colors cursor-pointer';
  return (
    <div
      className="flex h-full w-14 shrink-0 flex-col items-center gap-1 py-3"
      aria-label="BIO sections"
    >
      <button
        type="button"
        onClick={() => onSelectView('home')}
        aria-label="Home"
        aria-current={view === 'home' ? 'page' : undefined}
        title="Home"
        className={`${tabBase} ${
          view === 'home'
            ? 'bg-white/[0.08] text-zinc-100'
            : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200'
        }`}
      >
        <Home size={18} />
      </button>
      <button
        type="button"
        onClick={() => onSelectView('bio')}
        aria-label="BIO"
        aria-current={view === 'bio' ? 'page' : undefined}
        title="BIO"
        className={`${tabBase} ${
          view === 'bio' ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'
        }`}
      >
        <LeafMark />
      </button>
      {DECORATIVE.map(({ label, Icon }) => (
        <span
          key={label}
          aria-hidden="true"
          title={label}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-xl text-zinc-500"
        >
          <Icon size={18} />
        </span>
      ))}
      <button
        type="button"
        onClick={onOpenSettings}
        title="Settings & API Keys"
        aria-label="Settings"
        className="mt-auto flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <Settings size={18} />
      </button>
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          title={`Log out (${currentUser?.name || currentUser?.email || 'User'})`}
          aria-label="Log out"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:text-red-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <LogOut size={17} />
        </button>
      )}
    </div>
  );
}

export default AppRail;
