"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeSoftwarePurchaseHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><form data-aui=\"card\" data-aui-surface=\"\" data-aui-asform=\"true\"><header data-aui=\"card-title\">Purchase Pro plan</header><input data-aui=\"input\" aria-label=\"What is it for?\" placeholder=\"e.g. Engineering team\" name=\"purpose\"/><div data-aui=\"row\" data-aui-gap=\"3\"><input type=\"date\" data-aui=\"datepicker\" aria-label=\"Start date\" name=\"startDate\"/><input type=\"date\" data-aui=\"datepicker\" aria-label=\"Renewal date\" name=\"endDate\"/></div><div data-aui=\"row\" data-aui-gap=\"3\"><select data-aui=\"select\" name=\"seats\" aria-label=\"Volume\"><option value=\"\" disabled=\"\" selected=\"\">Seats</option><option value=\"5\">5 seats</option><option value=\"10\">10 seats</option><option value=\"25\">25 seats</option><option value=\"50\">50 seats</option></select><select data-aui=\"select\" name=\"frequency\" aria-label=\"Frequency\"><option value=\"\" disabled=\"\" selected=\"\">Billing</option><option value=\"monthly\">Monthly</option><option value=\"annual\">Annual</option></select></div><hr data-aui=\"divider\"/><dl data-aui=\"fact\"><dt data-aui=\"fact-label\">Total amount</dt><dd data-aui=\"fact-value\">$125 per month</dd></dl><footer data-aui=\"card-footer\"><button type=\"submit\" data-aui=\"card-confirm\">Confirm</button><button type=\"button\" data-aui=\"card-cancel\">Discard</button></footer></form></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeSoftwarePurchase({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-software-purchase"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeSoftwarePurchaseHtml }} />
      )}
    </div>
  );
}

export default GenerativeSoftwarePurchase;
