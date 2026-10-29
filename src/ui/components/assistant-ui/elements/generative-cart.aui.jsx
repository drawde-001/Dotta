"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeCartHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><section data-aui=\"card\"><header data-aui=\"card-title\">Your cart</header><ul data-aui=\"listview\"><li data-aui=\"listview-item\"><div data-aui=\"row\" data-aui-justify=\"between\"><span data-aui=\"text\" data-aui-size=\"md\">Wireless Headphones</span><p data-aui=\"caption\">$79.00</p></div></li><li data-aui=\"listview-item\"><div data-aui=\"row\" data-aui-justify=\"between\"><span data-aui=\"text\" data-aui-size=\"md\">USB-C Cable (2m)</span><p data-aui=\"caption\">$12.00</p></div></li><li data-aui=\"listview-item\"><div data-aui=\"row\" data-aui-justify=\"between\"><span data-aui=\"text\" data-aui-size=\"md\">Phone Case</span><p data-aui=\"caption\">$18.00</p></div></li></ul><hr data-aui=\"divider\"/><div data-aui=\"row\" data-aui-justify=\"between\"><dl data-aui=\"fact\"><dt data-aui=\"fact-label\">Subtotal</dt><dd data-aui=\"fact-value\">$109.00</dd></dl><dl data-aui=\"fact\"><dt data-aui=\"fact-label\">Tax</dt><dd data-aui=\"fact-value\">$9.81</dd></dl><dl data-aui=\"fact\"><dt data-aui=\"fact-label\">Total</dt><dd data-aui=\"fact-value\">$118.81</dd></dl></div><div data-aui=\"row\" data-aui-justify=\"end\"><button type=\"button\" data-aui=\"button\" data-aui-style=\"outline\" data-aui-action=\"{&quot;type&quot;:&quot;add_to_cart&quot;}\">Add to cart</button><button type=\"button\" data-aui=\"button\" data-aui-style=\"primary\" data-aui-action=\"{&quot;type&quot;:&quot;purchase_cart&quot;}\">Purchase</button></div></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeCart({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-cart"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeCartHtml }} />
      )}
    </div>
  );
}

export default GenerativeCart;
