"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeViewEventHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><section data-aui=\"card\"><p data-aui=\"caption\">Friday, July 24</p><h2 data-aui=\"header\" data-aui-size=\"md\">Design review</h2><p data-aui=\"caption\">9:00 to 9:30 AM · Conference Room B</p></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeViewEvent({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-view-event"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeViewEventHtml }} />
      )}
    </div>
  );
}

export default GenerativeViewEvent;
