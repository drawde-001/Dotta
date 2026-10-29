import React from "react";
import { cn } from "@/lib/utils";
export function Dialog({ open, onOpenChange, children }: any) {
  if (open === false) return null;
  return <div data-slot="dialog" data-open={open} onClick={() => onOpenChange?.(false)}>{children}</div>;
}
export function DialogTrigger({ children, ...props }: any) {
  return <button type="button" {...props}>{children}</button>;
}
export function DialogContent({ className, children, ...props }: any) {
  return (
    <div role="dialog" onClick={(e) => e.stopPropagation()} className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4", className)} {...props}>
      <div className="bg-background border-border relative w-full max-w-lg rounded-2xl border p-5 shadow-xl">{children}</div>
    </div>
  );
}
export function DialogHeader({ className, ...props }: any) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: any) {
  return <div className={cn("mt-4 flex justify-end gap-2", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: any) {
  return <h2 className={cn("text-base font-semibold", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: any) {
  return <p className={cn("text-muted-foreground text-sm", className)} {...props} />;
}
