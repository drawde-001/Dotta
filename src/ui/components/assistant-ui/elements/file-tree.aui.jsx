import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FileCode } from 'lucide-react';

const DEFAULT_ITEMS = [
  {
    type: 'folder',
    name: 'packages/core/src',
    open: true,
    children: [
      { type: 'file', name: 'converter.ts', added: 42, removed: 5 },
      { type: 'file', name: 'types.ts', added: 12, removed: 0 },
    ],
  },
  {
    type: 'folder',
    name: 'tests',
    open: true,
    children: [
      { type: 'file', name: 'smoke.test.ts', added: 24, removed: 4 },
    ],
  },
];

export function FileTree({
  title = '3 files changed',
  addCount = 78,
  removeCount = 9,
  items = DEFAULT_ITEMS,
  className = '',
  ...props
}) {
  const [treeState, setTreeState] = useState(items);

  const toggleFolder = (idx) => {
    setTreeState((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, open: !item.open } : item
      )
    );
  };

  return (
    <div
      data-slot="file-tree"
      className={`bg-background border border-border/60 dark:bg-popover flex w-full max-w-sm flex-col gap-2 rounded-2xl p-3.5 ${className}`}
      {...props}
    >
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[13.5px] font-medium text-foreground">{title}</span>
        <span className="font-mono text-[11px] tracking-tight tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{addCount}</span>{' '}
          <span className="text-red-600 dark:text-red-400">−{removeCount}</span>
        </span>
      </div>

      <div className="flex flex-col">
        {treeState.map((node, idx) => (
          <React.Fragment key={idx}>
            <div
              onClick={() => toggleFolder(idx)}
              className="fade-in slide-in-from-left-1 animate-in fill-mode-both hover:bg-foreground/[0.03] flex items-center gap-2 rounded-lg px-1 py-1 text-[13px] transition-colors duration-300 cursor-pointer"
              style={{ paddingInlineStart: '0.25rem' }}
            >
              {node.open ? (
                <ChevronDown className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronRight className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
              )}
              <Folder className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              <span className="text-foreground/60 min-w-0 flex-1 truncate">
                {node.name}
              </span>
            </div>

            {node.open &&
              node.children?.map((child, cIdx) => (
                <div
                  key={cIdx}
                  className="fade-in slide-in-from-left-1 animate-in fill-mode-both hover:bg-foreground/[0.03] flex items-center gap-2 rounded-lg px-1 py-1 text-[13px] transition-colors duration-300"
                  style={{ paddingInlineStart: '1.25rem' }}
                >
                  <FileCode className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                  <span className="text-foreground/90 min-w-0 flex-1 truncate">
                    {child.name}
                  </span>
                  {(child.added !== undefined || child.removed !== undefined) && (
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
                      +{child.added} -{child.removed}
                    </span>
                  )}
                </div>
              ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default FileTree;
