"use client";
import React, { useState, createContext, useContext } from "react";
import { cn } from "@/lib/utils";

const TooltipCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function TooltipProvider({ children }: any) {
  return <>{children}</>;
}

export function Tooltip({ open: controlledOpen, onOpenChange, children }: any) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setUncontrolled(v);
    onOpenChange?.(v);
  };
  return (
    <TooltipCtx.Provider value={{ open, setOpen }}>
      <span className="relative inline-flex">{children}</span>
    </TooltipCtx.Provider>
  );
}

export function TooltipTrigger({ asChild, children, ...props }: any) {
  const { setOpen } = useContext(TooltipCtx);
  const handlers = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { ...props, ...handlers });
  }
  return (
    <button type="button" {...props} {...handlers}>
      {children}
    </button>
  );
}

export function TooltipContent({ className, side = "top", children, ...props }: any) {
  const { open } = useContext(TooltipCtx);
  if (!open) return null;
  return (
    <div
      role="tooltip"
      data-side={side}
      className={cn(
        "bg-popover text-popover-foreground border-border absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 rounded-lg border px-2.5 py-1.5 text-xs shadow-md whitespace-nowrap",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
