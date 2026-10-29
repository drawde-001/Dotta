import React from "react";
import { cn } from "@/lib/utils";
export function Separator({ className, orientation = "horizontal", ...props }: any) {
  return <div data-slot="separator" className={cn("bg-border shrink-0", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)} {...props} />;
}
