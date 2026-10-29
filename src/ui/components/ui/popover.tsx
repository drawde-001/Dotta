import React, { useState, createContext, useContext } from "react";
import { cn } from "@/lib/utils";
const PopCtx = createContext<any>({ open: false, setOpen: () => {} });
export function Popover({ open: cOpen, onOpenChange, children }: any) {
  const [uOpen, setUOpen] = useState(false);
  const open = cOpen ?? uOpen;
  const setOpen = (v: boolean) => { if (cOpen === undefined) setUOpen(v); onOpenChange?.(v); };
  return <PopCtx.Provider value={{ open, setOpen }}><div className="relative inline-block">{children}</div></PopCtx.Provider>;
}
export function PopoverTrigger({ asChild, children, ...props }: any) {
  const { open, setOpen } = useContext(PopCtx);
  return <div onClick={() => setOpen(!open)} {...props}>{children}</div>;
}
export function PopoverContent({ className, children, ...props }: any) {
  const { open } = useContext(PopCtx);
  if (!open) return null;
  return <div className={cn("bg-popover text-popover-foreground border-border absolute z-50 mt-2 rounded-xl border p-3 shadow-lg", className)} {...props}>{children}</div>;
}
