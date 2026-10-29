"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeNotifyConfirmHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><section data-aui=\"card\"><h2 data-aui=\"header\" data-aui-size=\"md\">Delete this file?</h2><span data-aui=\"text\" data-aui-size=\"sm\" data-aui-color=\"secondary\">This action cannot be undone. Are you sure you want to continue?</span><div data-aui=\"row\" data-aui-justify=\"end\"><button type=\"button\" data-aui=\"button\" data-aui-style=\"outline\" data-aui-action=\"{&quot;type&quot;:&quot;cancel_delete&quot;}\">No</button><button type=\"button\" data-aui=\"button\" data-aui-style=\"primary\" data-aui-action=\"{&quot;type&quot;:&quot;confirm_delete&quot;}\">Yes</button></div></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeNotifyConfirm({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-notify-confirm"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeNotifyConfirmHtml }} />
      )}
    </div>
  );
}

export default GenerativeNotifyConfirm;
