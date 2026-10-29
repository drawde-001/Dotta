import React from "react";
import { cn } from "@/lib/utils";
export function Skeleton({ className, ...props }: any) {
  return <div data-slot="skeleton" className={cn("bg-muted animate-pulse rounded-md", className)} {...props} />;
}
