"use client";

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible-root";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const ANIMATION_DURATION = 200;

const ReasoningPreviewContext = createContext(false);

function reasoningVariants({ variant = "ghost", className } = {}) {
  const variantMap = {
    outline: "rounded-lg px-2.5 py-1.5",
    ghost: "px-0 py-1",
    muted: "bg-muted/40 rounded-lg px-2.5 py-1.5",
  };
  return cn(
    "aui-reasoning-root mb-2 w-full border-0 shadow-none outline-none",
    variantMap[variant] ?? variantMap.ghost,
    className
  );
}

const ReasoningRoot = forwardRef(function ReasoningRoot(
  {
    className,
    variant = "ghost",
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    defaultOpen = true,
    streaming,
    onAnimationStart,
    children,
    ...props
  },
  ref
) {
  const [initialOpen] = useState(defaultOpen);
  const [userOpen, setUserOpen] = useState(null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled
    ? controlledOpen
    : userOpen ?? (streaming || initialOpen);
  const isPreview = streaming === true && isOpen;

  const prevStreamingRef = useRef(streaming);
  useIsomorphicLayoutEffect(() => {
    if (prevStreamingRef.current === streaming) return;
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = streaming;
    if (wasStreaming && !streaming && !isControlled) {
      setUserOpen(null);
    }
    if (!isControlled && userOpen === null && !initialOpen) {
      onAnimationStart?.();
    }
  }, [streaming, isControlled, userOpen, initialOpen, onAnimationStart]);

  const handleOpenChange = useCallback(
    (open) => {
      onAnimationStart?.();
      if (!isControlled) {
        setUserOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [onAnimationStart, isControlled, controlledOnOpenChange]
  );

  return (
    <Collapsible
      ref={ref}
      data-slot="reasoning-root"
      data-variant={variant}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "group/reasoning-root",
        reasoningVariants({ variant, className })
      )}
      style={{
        "--animation-duration": `${ANIMATION_DURATION}ms`,
      }}
      {...props}
    >
      <ReasoningPreviewContext.Provider value={isPreview}>
        {children}
      </ReasoningPreviewContext.Provider>
    </Collapsible>
  );
});

function ReasoningFade({ side = "bottom", className, ...props }) {
  if (side === "top") {
    return (
      <div
        data-slot="reasoning-fade"
        className={cn(
          "aui-reasoning-fade pointer-events-none absolute inset-x-0 top-0 z-10 h-6",
          "bg-[linear-gradient(to_bottom,var(--color-background),transparent)]",
          "fade-in-0 animate-in",
          className
        )}
        {...props}
      />
    );
  }

  return (
    <div
      data-slot="reasoning-fade"
      className={cn(
        "aui-reasoning-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6",
        "bg-[linear-gradient(to_top,var(--color-background),transparent)]",
        "fade-in-0 animate-in",
        className
      )}
      {...props}
    />
  );
}

function ReasoningTrigger({
  active,
  duration,
  label = "Reasoning",
  className,
  ...props
}) {
  const durationText = duration ? ` (${duration}s)` : "";

  return (
    <CollapsibleTrigger
      data-slot="reasoning-trigger"
      className={cn(
        "aui-reasoning-trigger group/trigger text-muted-foreground hover:text-foreground flex max-w-[75%] origin-left items-center gap-2 py-1 text-sm transition-[color,scale] active:scale-[0.98] cursor-pointer",
        className
      )}
      {...props}
    >
      <BrainIcon
        data-slot="reasoning-trigger-icon"
        className="aui-reasoning-trigger-icon size-4 shrink-0"
      />
      <span
        data-slot="reasoning-trigger-label"
        className={cn(
          "aui-reasoning-trigger-label-wrapper inline-block leading-none tabular-nums",
          active && "shimmer motion-reduce:animate-none"
        )}
      >
        {label}
        {durationText}
      </span>
      <ChevronDownIcon
        data-slot="reasoning-trigger-chevron"
        className={cn(
          "aui-reasoning-trigger-chevron mt-0.5 size-4 shrink-0",
          "transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          "-rotate-90",
          "group-data-open/trigger:rotate-0",
          "group-data-panel-open/trigger:rotate-0"
        )}
      />
    </CollapsibleTrigger>
  );
}

function ReasoningContent({ className, children, ...props }) {
  const isPreview = useContext(ReasoningPreviewContext);

  return (
    <CollapsibleContent
      data-slot="reasoning-content"
      className={cn(
        "aui-reasoning-content text-muted-foreground relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none",
        "data-closed:animate-collapsible-up",
        "data-open:animate-collapsible-down",
        "data-closed:fill-mode-forwards",
        "data-closed:pointer-events-none",
        className
      )}
      {...props}
    >
      {children}
      {isPreview ? <ReasoningFade /> : null}
    </CollapsibleContent>
  );
}

function ReasoningText({ className, children, ...props }) {
  const isPreview = useContext(ReasoningPreviewContext);
  const scrollRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!isPreview) return;
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    let pinned = true;
    let lastScrollTop = scrollEl.scrollTop;
    let lastScrollHeight = scrollEl.scrollHeight;
    const isAtBottom = () =>
      Math.abs(
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
      ) <= 1 || scrollEl.scrollHeight <= scrollEl.clientHeight;

    const pin = () => {
      if (!pinned) return;
      scrollEl.scrollTop = scrollEl.scrollHeight;
    };
    const onScroll = () => {
      if (isAtBottom()) {
        pinned = true;
      } else if (
        scrollEl.scrollTop < lastScrollTop &&
        scrollEl.scrollHeight === lastScrollHeight
      ) {
        pinned = false;
      }
      lastScrollTop = scrollEl.scrollTop;
      lastScrollHeight = scrollEl.scrollHeight;
    };

    pin();
    scrollEl.addEventListener("scroll", onScroll);
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(pin);
      observer.observe(contentEl);
      return () => {
        scrollEl.removeEventListener("scroll", onScroll);
        observer.disconnect();
      };
    }
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
    };
  }, [isPreview]);

  return (
    <div
      ref={scrollRef}
      data-slot="reasoning-text"
      className={cn(
        "aui-reasoning-text relative z-0 max-h-64 overflow-y-auto ps-6 pt-2 pb-2 leading-relaxed text-pretty whitespace-pre-wrap",
        className
      )}
      {...props}
    >
      <div ref={contentRef} className="aui-reasoning-text-content space-y-2">
        {children}
      </div>
    </div>
  );
}

function deriveReasoningLabel(text, streaming, explicitLabel) {
  if (explicitLabel) return explicitLabel;
  if (!streaming) return "Thought process";
  if (typeof text === "string" && text.trim()) {
    const lines = text
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const boldMatch = line.match(/^\*\*(.+?)\*\*$/);
      if (boldMatch) {
        return `Thinking · ${boldMatch[1].slice(0, 48)}`;
      }
      const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
      if (headingMatch) {
        return `Thinking · ${headingMatch[1].slice(0, 48)}`;
      }
    }
  }
  return "Thinking";
}

export function Reasoning({
  text,
  status,
  streaming: propStreaming,
  duration,
  label,
  open,
  onOpenChange,
  variant = "ghost",
  children,
  className,
}) {
  const streaming = propStreaming ?? status?.type === "running";
  const resolvedLabel = deriveReasoningLabel(text, streaming, label);
  return (
    <ReasoningRoot
      variant={variant}
      streaming={streaming}
      open={open}
      onOpenChange={onOpenChange}
      className={className}
    >
      <ReasoningTrigger
        active={streaming}
        duration={duration}
        label={resolvedLabel}
      />
      <ReasoningContent aria-busy={streaming}>
        <ReasoningText>{text || children}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
}

export {
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
  ReasoningFade,
  reasoningVariants,
};

export default Reasoning;
