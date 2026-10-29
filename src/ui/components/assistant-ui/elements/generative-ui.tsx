"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";
import { MarkdownText } from "./markdown-text";
import { GeoMap } from "./geo-map";
import { MermaidDiagram } from "./mermaid-diagram";

export function GenerativeUI({ spec, children, className, ...props }: any) {
  return (
    <div data-slot="generative-ui" data-aui-theme="elements" className={cn(paper, "rounded-2xl p-4", className)} {...props}>
      {children || (spec?.title ? <div className="text-sm font-medium">{spec.title}</div> : null)}
    </div>
  );
}

export const styledGenerativeUILibrary = {
  Markdown: {
    render: ({ value, children }: any) => (
      <div data-aui="markdown">
        <MarkdownText text={value ?? ""} />
        {children}
      </div>
    ),
  },
  Diagram: {
    render: ({ code, title }: any) => (
      <figure data-aui="diagram">
        <MermaidDiagram code={typeof code === "string" ? code : ""} title={title} />
      </figure>
    ),
  },
  Map: {
    render: ({ places }: any) => <GeoMap data-aui="map" places={Array.isArray(places) ? places : []} />,
  },
};
export default GenerativeUI;
