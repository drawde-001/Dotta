/**
 * surfaces.js
 *
 * Core assistant-ui surface mixins and button classes.
 * Conforms to assistant-ui design tokens and Tailwind utility contracts.
 */

export const ghostButton =
  'hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-[10px] text-xs font-medium transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50';

export const inkButton =
  'bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center rounded-[10px] text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:pointer-events-none disabled:opacity-50';

export const outlineButton =
  'border border-border/70 hover:bg-foreground/[0.04] text-foreground inline-flex items-center justify-center rounded-[10px] text-xs font-medium transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50';

export const panelCard =
  'bg-foreground/[0.025] dark:bg-foreground/[0.04] border border-border/60 rounded-[16px] text-foreground transition-all';

export const controlButton =
  'h-8 px-3 rounded-[10px] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer';
