"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeDraftEmailHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><section data-aui=\"card\"><header data-aui=\"card-title\">New message</header><form data-aui=\"form\" data-aui-action=\"{&quot;type&quot;:&quot;send_email&quot;}\"><div data-aui=\"row\" data-aui-align=\"center\"><p data-aui=\"caption\">From</p><span data-aui=\"text\" data-aui-size=\"sm\">me@example.com</span></div><div data-aui=\"row\" data-aui-align=\"center\"><p data-aui=\"caption\">To</p><input data-aui=\"input\" placeholder=\"recipient@example.com\" name=\"to\"/></div><input data-aui=\"input\" aria-label=\"Subject\" placeholder=\"Subject\" name=\"subject\"/><textarea data-aui=\"input\" data-aui-multiline=\"true\" name=\"body\" aria-label=\"Message\" placeholder=\"Write your message...\"></textarea><div data-aui=\"row\" data-aui-justify=\"end\"><button type=\"button\" data-aui=\"button\" data-aui-style=\"ghost\" data-aui-action=\"{&quot;type&quot;:&quot;discard_email&quot;}\">Discard</button><button type=\"submit\" data-aui=\"button\" data-aui-style=\"primary\" data-aui-submit=\"true\">Send email</button></div></form></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeDraftEmail({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-draft-email"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeDraftEmailHtml }} />
      )}
    </div>
  );
}

export default GenerativeDraftEmail;
