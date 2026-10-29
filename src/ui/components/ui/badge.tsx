import React from "react";
import { cn } from "@/lib/utils";
export function Badge({ className, variant = "default", ...props }: any) {
  return <span data-slot="badge" data-variant={variant} className={cn("inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium", className)} {...props} />;
}
