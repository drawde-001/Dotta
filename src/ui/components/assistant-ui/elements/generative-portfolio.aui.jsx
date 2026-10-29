"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativePortfolioHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.68]\"><section data-aui=\"card\"><header data-aui=\"card-title\">Portfolio overview</header><div data-aui=\"row\" data-aui-gap=\"6\"><dl data-aui=\"fact\"><dt data-aui=\"fact-label\">Total value</dt><dd data-aui=\"fact-value\">$128,430</dd></dl><dl data-aui=\"fact\"><dt data-aui=\"fact-label\">Today</dt><dd data-aui=\"fact-value\">+2.4%</dd></dl><dl data-aui=\"fact\"><dt data-aui=\"fact-label\">Positions</dt><dd data-aui=\"fact-value\">12</dd></dl></div><h2 data-aui=\"header\" data-aui-size=\"sm\">Performance</h2><div data-aui=\"chart-frame\"><div data-aui=\"chart-ticks\"><div>200,000</div><div>150,000</div><div>100,000</div><div>50,000</div><div>0</div></div><svg data-aui=\"chart\" data-aui-variant=\"bar\" role=\"img\" aria-label=\"bar chart with 5 data points\" viewBox=\"0 0 100 40\" preserveAspectRatio=\"none\"><g data-aui=\"chart-series\" data-aui-series=\"0\"><rect x=\"2\" y=\"15.920000000000002\" width=\"16\" height=\"24.08\" fill=\"currentColor\"><title>Mon: 120,400</title></rect><rect x=\"22\" y=\"15.64\" width=\"16\" height=\"24.36\" fill=\"currentColor\"><title>Tue: 121,800</title></rect><rect x=\"42\" y=\"16.080000000000002\" width=\"16\" height=\"23.919999999999998\" fill=\"currentColor\"><title>Wed: 119,600</title></rect><rect x=\"62\" y=\"15.16\" width=\"16\" height=\"24.84\" fill=\"currentColor\"><title>Thu: 124,200</title></rect><rect x=\"82\" y=\"14.314\" width=\"16\" height=\"25.686\" fill=\"currentColor\"><title>Fri: 128,430</title></rect></g></svg><div data-aui=\"chart-xlabels\"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div></div></div><table data-aui=\"table\"><thead><tr><th data-aui=\"table-col\">Symbol</th><th data-aui=\"table-col\">Shares</th><th data-aui=\"table-col\">Price</th><th data-aui=\"table-col\">Value</th></tr></thead><tbody><tr><td>ACME</td><td>40</td><td>$182.10</td><td>$7,284.00</td></tr><tr><td>GLBX</td><td>25</td><td>$94.55</td><td>$2,363.75</td></tr><tr><td>NORT</td><td>15</td><td>$310.20</td><td>$4,653.00</td></tr></tbody></table><div data-aui=\"markdown\"><p>Prices delayed by 15 minutes.</p></div></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativePortfolio({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-portfolio"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativePortfolioHtml }} />
      )}
    </div>
  );
}

export default GenerativePortfolio;
