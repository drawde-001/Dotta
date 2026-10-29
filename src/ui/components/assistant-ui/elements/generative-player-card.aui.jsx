"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativePlayerCardHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><section data-aui=\"card\"><h2 data-aui=\"header\" data-aui-size=\"lg\">Marcus Chen</h2><p data-aui=\"caption\">Point Guard · #23</p><div data-aui=\"row\" data-aui-justify=\"between\"><div data-aui=\"col\" data-aui-gap=\"1\" data-aui-align=\"center\"><span data-aui=\"text\" data-aui-size=\"2xl\" data-aui-weight=\"bold\">24.6</span><p data-aui=\"caption\">PPG</p></div><div data-aui=\"col\" data-aui-gap=\"1\" data-aui-align=\"center\"><span data-aui=\"text\" data-aui-size=\"2xl\" data-aui-weight=\"bold\">8.1</span><p data-aui=\"caption\">AST</p></div><div data-aui=\"col\" data-aui-gap=\"1\" data-aui-align=\"center\"><span data-aui=\"text\" data-aui-size=\"2xl\" data-aui-weight=\"bold\">5.3</span><p data-aui=\"caption\">REB</p></div><div data-aui=\"col\" data-aui-gap=\"1\" data-aui-align=\"center\"><span data-aui=\"text\" data-aui-size=\"2xl\" data-aui-weight=\"bold\">27.9</span><p data-aui=\"caption\">EFF</p></div></div></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativePlayerCard({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-player-card"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativePlayerCardHtml }} />
      )}
    </div>
  );
}

export default GenerativePlayerCard;
