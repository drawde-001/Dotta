"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeBookingHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><form data-aui=\"card\" data-aui-surface=\"\" data-aui-asform=\"true\"><h2 data-aui=\"header\" data-aui-size=\"md\">Reserve a table</h2><span data-aui=\"text\" data-aui-size=\"sm\" data-aui-color=\"secondary\">We hold the table for 15 minutes past the reserved time.</span><input data-aui=\"input\" aria-label=\"Name\" placeholder=\"Full name\" name=\"guestName\"/><select data-aui=\"select\" name=\"partySize\" aria-label=\"Party size\"><option value=\"\" disabled=\"\" selected=\"\">Select party size</option><option value=\"1\">1 guest</option><option value=\"2\">2 guests</option><option value=\"3\">3 guests</option><option value=\"4\">4+ guests</option></select><input type=\"date\" data-aui=\"datepicker\" aria-label=\"Date\" name=\"date\"/><fieldset data-aui=\"radiogroup\" aria-label=\"Seating preference\"><label data-aui=\"radiogroup-option\"><input type=\"radio\" data-aui-field-name=\"seating\" name=\"[&quot;_R_mpbsnqknpfknmd6lb_&quot;,&quot;seating&quot;]\" checked=\"\" value=\"indoor\"/>Indoor</label><label data-aui=\"radiogroup-option\"><input type=\"radio\" data-aui-field-name=\"seating\" name=\"[&quot;_R_mpbsnqknpfknmd6lb_&quot;,&quot;seating&quot;]\" value=\"patio\"/>Patio</label></fieldset><label data-aui=\"checkbox\"><input type=\"checkbox\" name=\"reminder\"/><span data-aui=\"checkbox-label\">Send a reminder 1 hour before</span></label><footer data-aui=\"card-footer\"><button type=\"submit\" data-aui=\"card-confirm\">Confirm reservation</button><button type=\"button\" data-aui=\"card-cancel\">Cancel</button></footer></form></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeBooking({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-booking"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeBookingHtml }} />
      )}
    </div>
  );
}

export default GenerativeBooking;
