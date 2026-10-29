import React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, any>(({ className, ...props }, ref) => (
  <input ref={ref} data-slot="input" className={cn("border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none", className)} {...props} />
));
