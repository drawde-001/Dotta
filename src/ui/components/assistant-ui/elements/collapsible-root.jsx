"use client";

import React, { createContext, forwardRef, useContext, useState, useCallback } from "react";

const CollapsibleContext = createContext({
  open: false,
  disabled: false,
  onOpenChange: (_open) => {},
});

export const CollapsibleRoot = forwardRef(function CollapsibleRoot(
  {
    open: controlledOpen,
    defaultOpen = false,
    onOpenChange,
    disabled = false,
    style,
    children,
    ...props
  },
  ref
) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? Boolean(controlledOpen) : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (nextOpen) => {
      if (disabled) return;
      const resolved = typeof nextOpen === "function" ? nextOpen(open) : Boolean(nextOpen);
      if (!isControlled) {
        setUncontrolledOpen(resolved);
      }
      onOpenChange?.(resolved);
    },
    [disabled, isControlled, onOpenChange, open]
  );

  return (
    <CollapsibleContext.Provider value={{ open, disabled, onOpenChange: handleOpenChange }}>
      <div
        ref={ref}
        data-slot="collapsible"
        data-state={open ? "open" : "closed"}
        data-open={open ? "" : undefined}
        data-closed={!open ? "" : undefined}
        data-disabled={disabled ? "" : undefined}
        style={{ "--collapsible-panel-height": "auto", ...style }}
        {...props}
      >
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
});

export const CollapsibleTrigger = forwardRef(function CollapsibleTrigger(
  { onClick, disabled: propDisabled, type = "button", ...props },
  ref
) {
  const { open, disabled: ctxDisabled, onOpenChange } = useContext(CollapsibleContext);
  const isDisabled = propDisabled ?? ctxDisabled;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-expanded={open}
      data-slot="collapsible-trigger"
      data-state={open ? "open" : "closed"}
      data-open={open ? "" : undefined}
      data-closed={!open ? "" : undefined}
      data-panel-open={open ? "" : undefined}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !isDisabled) {
          onOpenChange(!open);
        }
      }}
      {...props}
    />
  );
});

export const CollapsibleContent = forwardRef(function CollapsibleContent(
  { forceMount, children, style, ...props },
  ref
) {
  const { open } = useContext(CollapsibleContext);

  if (!open && !forceMount) {
    return (
      <div
        ref={ref}
        data-slot="collapsible-content"
        data-state="closed"
        data-closed=""
        hidden
        style={{ "--collapsible-panel-height": "auto", ...style }}
        {...props}
      />
    );
  }

  return (
    <div
      ref={ref}
      data-slot="collapsible-content"
      data-state={open ? "open" : "closed"}
      data-open={open ? "" : undefined}
      data-closed={!open ? "" : undefined}
      hidden={!open}
      style={{ "--collapsible-panel-height": "auto", ...style }}
      {...props}
    >
      {children}
    </div>
  );
});

export default CollapsibleRoot;
