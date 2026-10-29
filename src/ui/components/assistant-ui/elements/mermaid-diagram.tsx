"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper, mono } from "./surfaces";

export function MermaidDiagram({ code = "", title, className, ...props }: any) {
  return (
    <div
      data-slot="mermaid-diagram"
      className={cn(paper, "flex w-full flex-col gap-2 overflow-x-auto rounded-2xl p-4", className)}
      {...props}
    >
      {title && <div className="text-xs font-medium text-muted-foreground">{title}</div>}
      <pre className={cn(mono, "text-foreground/85 whitespace-pre-wrap leading-relaxed")}>{code}</pre>
    </div>
  );
}
export default MermaidDiagram;
