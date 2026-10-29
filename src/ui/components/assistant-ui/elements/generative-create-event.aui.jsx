"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeCreateEventHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><section data-aui=\"card\" data-aui-surface=\"\"><div data-aui=\"row\" data-aui-gap=\"3\" data-aui-align=\"center\"><span data-aui=\"text\" data-aui-size=\"3xl\" data-aui-weight=\"bold\">24</span><div data-aui=\"col\" data-aui-gap=\"0\"><span data-aui=\"text\" data-aui-size=\"md\" data-aui-weight=\"semibold\">July</span><p data-aui=\"caption\">Friday</p></div></div><hr data-aui=\"divider\"/><div data-aui=\"col\" data-aui-gap=\"3\"><div data-aui=\"row\" data-aui-gap=\"3\" data-aui-align=\"center\"><div data-aui=\"box\" data-aui-radius=\"full\" style=\"width:3px;height:32px;background:color-mix(in oklab, var(--foreground) 80%, transparent);border-radius:9999px\"></div><div data-aui=\"col\" data-aui-gap=\"0\"><span data-aui=\"text\" data-aui-size=\"md\" data-aui-weight=\"medium\">Design review</span><p data-aui=\"caption\">9:00 to 9:30 AM</p></div><div data-aui=\"spacer\"></div><span data-aui=\"badge\" data-aui-variant=\"info\">Work</span></div><div data-aui=\"row\" data-aui-gap=\"3\" data-aui-align=\"center\"><div data-aui=\"box\" data-aui-radius=\"full\" style=\"width:3px;height:32px;background:color-mix(in oklab, var(--foreground) 45%, transparent);border-radius:9999px\"></div><div data-aui=\"col\" data-aui-gap=\"0\"><span data-aui=\"text\" data-aui-size=\"md\" data-aui-weight=\"medium\">Lunch with Sam</span><p data-aui=\"caption\">12:30 to 1:30 PM</p></div><div data-aui=\"spacer\"></div><span data-aui=\"badge\" data-aui-variant=\"warning\">Personal</span></div><div data-aui=\"row\" data-aui-gap=\"3\" data-aui-align=\"center\"><div data-aui=\"box\" data-aui-radius=\"full\" style=\"width:3px;height:32px;background:color-mix(in oklab, var(--foreground) 25%, transparent);border-radius:9999px\"></div><div data-aui=\"col\" data-aui-gap=\"0\"><span data-aui=\"text\" data-aui-size=\"md\" data-aui-weight=\"medium\">Flight to Tokyo</span><p data-aui=\"caption\">6:45 PM</p></div><div data-aui=\"spacer\"></div><span data-aui=\"badge\" data-aui-variant=\"success\">Travel</span></div></div><footer data-aui=\"card-footer\"><button type=\"button\" data-aui=\"card-confirm\">Add to calendar</button><button type=\"button\" data-aui=\"card-cancel\">Discard</button></footer></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeCreateEvent({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-create-event"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeCreateEventHtml }} />
      )}
    </div>
  );
}

export default GenerativeCreateEvent;
