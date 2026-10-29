import React from "react";
import { cn } from "@/lib/utils";
export function Command({ className, children, ...props }: any) {
  return <div data-slot="command" className={cn("bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md", className)} {...props}>{children}</div>;
}
export function CommandInput({ className, ...props }: any) {
  return <input className={cn("w-full bg-transparent px-3 py-2 text-sm outline-none", className)} {...props} />;
}
export function CommandList({ className, children, ...props }: any) {
  return <div className={cn("max-h-72 overflow-y-auto", className)} {...props}>{children}</div>;
}
export function CommandEmpty({ children, ...props }: any) {
  return <div className="py-4 text-center text-xs text-muted-foreground" {...props}>{children}</div>;
}
export function CommandGroup({ heading, children, className, ...props }: any) {
  return <div className={cn("p-1", className)} {...props}>{heading && <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{heading}</div>}{children}</div>;
}
export function CommandItem({ className, onSelect, children, ...props }: any) {
  return <div role="option" onClick={onSelect} className={cn("hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm", className)} {...props}>{children}</div>;
}
export function CommandSeparator({ className, ...props }: any) {
  return <div className={cn("bg-border -mx-1 my-1 h-px", className)} {...props} />;
}
