import React, { useState } from 'react';
import { ChevronRight, Plug } from 'lucide-react';

const DEFAULT_SERVERS = [
  {
    id: 'github',
    name: 'github-mcp',
    status: 'connected',
    protocol: 'streamable-http',
    tools: ['list_issues', 'create_pr', 'get_diff'],
  },
  {
    id: 'supabase',
    name: 'supabase-mcp',
    status: 'connected',
    protocol: 'stdio',
    tools: ['list_tables', 'execute_sql', 'get_schema'],
  },
  {
    id: 'figma',
    name: 'figma-mcp',
    status: 'disconnected',
    protocol: 'streamable-http',
    tools: ['get_figma_data', 'download_images'],
  },
];

export function McpServerPanel({
  servers = DEFAULT_SERVERS,
  className = '',
  ...props
}) {
  const [openIds, setOpenIds] = useState(new Set([servers[0]?.id]));

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const connectedCount = servers.filter((s) => s.status === 'connected').length;

  return (
    <div
      data-slot="mcp-server-panel"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-sm flex-col gap-1 rounded-2xl p-3 ${className}`}
      {...props}
    >
      <div className="flex items-baseline justify-between px-1 pb-1">
        <span className="text-[13.5px] font-medium text-foreground">Servers</span>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground tabular-nums">
          {connectedCount} of {servers.length} connected
        </span>
      </div>

      <div className="flex flex-col">
        {servers.map((srv) => {
          const isOpen = openIds.has(srv.id);
          const isConnected = srv.status === 'connected';

          return (
            <div key={srv.id} className="flex flex-col">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(srv.id)}
                className="flex items-center gap-2.5 rounded-xl px-1.5 py-2 text-start hover:bg-foreground/[0.04] transition-colors cursor-pointer"
              >
                <ChevronRight
                  className={`text-muted-foreground size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                  aria-hidden="true"
                />
                <Plug className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
                  {srv.name}
                </span>
                <span className="font-mono text-[11px] tracking-tight text-muted-foreground shrink-0">
                  {srv.tools.length} tools
                </span>
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-full ${
                    isConnected ? 'bg-emerald-500' : 'bg-foreground/20'
                  }`}
                />
                <span className="sr-only">{srv.status}</span>
              </button>

              {isOpen && (
                <div className="fade-in slide-in-from-top-1 animate-in flex flex-col gap-1.5 px-1.5 ps-8 pb-2 duration-200">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
                      {srv.protocol}
                    </span>
                    <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
                      · {srv.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {srv.tools.map((t) => (
                      <span
                        key={t}
                        className="bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06] font-mono text-[11px] tracking-tight text-muted-foreground rounded-md px-1.5 py-0.5"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default McpServerPanel;
