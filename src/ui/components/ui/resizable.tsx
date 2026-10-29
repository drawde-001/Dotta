import React from "react";
import { cn } from "@/lib/utils";
export function ResizablePanelGroup({ className, children, ...props }: any) {
  return <div data-slot="resizable-panel-group" className={cn("flex h-full w-full", className)} {...props}>{children}</div>;
}
export function ResizablePanel({ className, children, ...props }: any) {
  return <div data-slot="resizable-panel" className={cn("flex-1 overflow-auto", className)} {...props}>{children}</div>;
}
export function ResizableHandle({ className, ...props }: any) {
  return <div data-slot="resizable-handle" className={cn("bg-border w-px shrink-0", className)} {...props} />;
}
