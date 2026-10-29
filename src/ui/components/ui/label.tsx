import React from "react";
import { cn } from "@/lib/utils";
export function Label({ className, ...props }: any) {
  return <label data-slot="label" className={cn("text-xs font-medium leading-none", className)} {...props} />;
}
