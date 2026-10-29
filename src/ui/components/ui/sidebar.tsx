import React from "react";
import { cn } from "@/lib/utils";
export function SidebarProvider({ children }: any) { return <>{children}</>; }
export function Sidebar({ className, children, ...props }: any) {
  return <aside data-slot="sidebar" className={cn("bg-background border-border flex h-full w-64 flex-col border-r", className)} {...props}>{children}</aside>;
}
export function SidebarHeader({ className, children, ...props }: any) {
  return <div className={cn("p-3", className)} {...props}>{children}</div>;
}
export function SidebarContent({ className, children, ...props }: any) {
  return <div className={cn("flex-1 overflow-y-auto p-2", className)} {...props}>{children}</div>;
}
export function SidebarFooter({ className, children, ...props }: any) {
  return <div className={cn("p-3", className)} {...props}>{children}</div>;
}
export function SidebarRail({ className, ...props }: any) {
  return <div className={cn("w-1", className)} {...props} />;
}
export function SidebarMenu({ className, children, ...props }: any) {
  return <ul className={cn("flex flex-col gap-1", className)} {...props}>{children}</ul>;
}
export function SidebarMenuItem({ className, children, ...props }: any) {
  return <li className={cn("list-none", className)} {...props}>{children}</li>;
}
export function SidebarMenuButton({ className, children, asChild, ...props }: any) {
  return <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm", className)} {...props}>{children}</div>;
}
