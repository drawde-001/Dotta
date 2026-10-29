"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper, mono } from "./surfaces";

export function ShikiHighlighter({ code = "", language = "tsx", className, ...props }: any) {
  return (
    <pre
      data-slot="shiki-highlighter"
      data-language={language}
      className={cn(paper, mono, "overflow-x-auto rounded-xl p-3.5 text-foreground/90 leading-relaxed", className)}
      {...props}
    >
      <code>{code}</code>
    </pre>
  );
}
export const SyntaxHighlighter = ShikiHighlighter;
export default ShikiHighlighter;
