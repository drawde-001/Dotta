"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeChannelMessageHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><section data-aui=\"card\"><div data-aui=\"row\" data-aui-justify=\"between\"><p data-aui=\"caption\">#product-updates</p><p data-aui=\"caption\">Today at 2:14 PM</p></div><div data-aui=\"row\" data-aui-align=\"center\"><img data-aui=\"image\" data-aui-size=\"sm\" data-aui-round=\"true\" src=\"https://i.pravatar.cc/150?img=12\" alt=\"Jordan Lee\"/><span data-aui=\"text\" data-aui-size=\"md\" data-aui-weight=\"semibold\">Jordan Lee</span></div><div data-aui=\"markdown\"><p>Shipping three things this week:</p>\n<ol>\n<li><strong>Faster search</strong> across the whole workspace</li>\n<li><strong>Dark mode</strong> for the mobile app</li>\n<li>A refreshed <strong>onboarding flow</strong></li>\n</ol>\n<p>Let us know what you think!</p></div></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeChannelMessage({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-channel-message"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeChannelMessageHtml }} />
      )}
    </div>
  );
}

export default GenerativeChannelMessage;
