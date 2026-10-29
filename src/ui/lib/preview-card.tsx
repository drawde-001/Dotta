"use client";
import React, { createContext, useContext, useState } from "react";

const PreviewCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

function Root({ open: controlledOpen, onOpenChange, children }: any) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };
  return (
    <PreviewCtx.Provider value={{ open, setOpen }}>
      <span className="relative inline-block">{children}</span>
    </PreviewCtx.Provider>
  );
}

function Trigger({ render, className, children, ...props }: any) {
  const { open, setOpen } = useContext(PreviewCtx);
  const triggerProps = {
    ...props,
    className,
    "data-popup-open": open ? "" : undefined,
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    onClick: () => setOpen(!open),
  };
  if (React.isValidElement(render)) {
    return React.cloneElement(render, triggerProps, children);
  }
  return <button type="button" {...triggerProps}>{children}</button>;
}

function Portal({ children }: any) {
  const { open } = useContext(PreviewCtx);
  if (!open) return null;
  return <>{children}</>;
}

function Positioner({ children, className }: any) {
  return (
    <div className={className || "absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2"}>
      {children}
    </div>
  );
}

function Popup({ children, className, ...props }: any) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

export const PreviewCard = { Root, Trigger, Portal, Positioner, Popup };
export default PreviewCard;
