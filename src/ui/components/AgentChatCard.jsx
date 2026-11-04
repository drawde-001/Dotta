import React, { useEffect, useRef } from 'react';
import { MessageSquare, X } from 'lucide-react';

function messageText(msg) {
  return (msg?.content || [])
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

export function AgentChatCard({
  messages = [],
  isWorking = false,
  composer = null,
  onClose = null,
  isMobileSheet = false,
  className = ''
}) {
  const logRef = useRef(null);
  const visible = messages
    .map((msg) => ({ id: msg.id, role: msg.role, text: messageText(msg) }))
    .filter((msg) => msg.text.trim().length > 0);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isWorking]);

  return (
    <aside
      aria-label="Agent chat"
      className={`flex h-full flex-col ${
        isMobileSheet
          ? 'w-full bg-[#121216]'
          : 'w-[320px] shrink-0 border-l border-white/[0.06] bg-[#141417] xl:w-[360px]'
      } ${className}`}
    >
      <div className="shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-zinc-700/60 bg-zinc-800 text-zinc-200">
            <MessageSquare size={16} />
          </span>
          <h2 className="text-sm font-semibold leading-snug tracking-tight text-zinc-100 truncate">
            Tell agent the changes you want to make
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close BIO Assist"
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer shrink-0 ml-2"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div
        ref={logRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {visible.length === 0 ? (
          <p className="text-xs leading-relaxed text-zinc-500">
            Describe a change to this profile and the agent will draft it here for
            your approval. Nothing is saved without your confirmation.
          </p>
        ) : (
          visible.map((msg) =>
            msg.role === 'user' ? (
              <div
                key={msg.id}
                className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-zinc-100 px-3 py-2 text-[13px] leading-relaxed text-zinc-950"
              >
                {msg.text}
              </div>
            ) : (
              <div
                key={msg.id}
                className="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-[13px] leading-relaxed text-zinc-300"
              >
                {msg.text}
              </div>
            )
          )
        )}
        {isWorking && (
          <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-[13px] leading-relaxed text-zinc-500">
            Agent is working...
          </div>
        )}
      </div>

      <div className={`shrink-0 p-2.5 sm:p-3 ${isMobileSheet ? 'border-t-0 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))]' : 'border-t border-white/[0.06] pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}>{composer}</div>
    </aside>
  );
}

export default AgentChatCard;
