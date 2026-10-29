"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const GenerativeChartBarsHtml = "<div data-aui-theme=\"elements\" class=\"aui-gallery w-full max-w-sm origin-center scale-[0.85]\"><section data-aui=\"card\"><header data-aui=\"card-title\">Support tickets by channel</header><div data-aui=\"chart-frame\"><div data-aui=\"chart-ticks\"><div>100</div><div>75</div><div>50</div><div>25</div><div>0</div></div><svg data-aui=\"chart\" data-aui-variant=\"bar\" role=\"img\" aria-label=\"bar chart with 4 data points\" viewBox=\"0 0 100 40\" preserveAspectRatio=\"none\"><g data-aui=\"chart-series\" data-aui-series=\"0\"><rect x=\"2.5\" y=\"23.2\" width=\"20\" height=\"16.8\" fill=\"currentColor\"><title>Email, W1: 42</title></rect><rect x=\"27.5\" y=\"24.8\" width=\"20\" height=\"15.2\" fill=\"currentColor\"><title>Email, W2: 38</title></rect><rect x=\"52.5\" y=\"19.6\" width=\"20\" height=\"20.4\" fill=\"currentColor\"><title>Email, W3: 51</title></rect><rect x=\"77.5\" y=\"26\" width=\"20\" height=\"14\" fill=\"currentColor\"><title>Email, W4: 35</title></rect></g><g data-aui=\"chart-series\" data-aui-series=\"1\"><rect x=\"2.5\" y=\"11.999999999999998\" width=\"20\" height=\"11.200000000000001\" fill=\"currentColor\"><title>Chat, W1: 28</title></rect><rect x=\"27.5\" y=\"11.6\" width=\"20\" height=\"13.200000000000001\" fill=\"currentColor\"><title>Chat, W2: 33</title></rect><rect x=\"52.5\" y=\"9.600000000000001\" width=\"20\" height=\"10\" fill=\"currentColor\"><title>Chat, W3: 25</title></rect><rect x=\"77.5\" y=\"10\" width=\"20\" height=\"16\" fill=\"currentColor\"><title>Chat, W4: 40</title></rect></g><g data-aui=\"chart-series\" data-aui-series=\"2\"><rect x=\"2.5\" y=\"7.2\" width=\"20\" height=\"4.8\" fill=\"currentColor\"><title>Phone, W1: 12</title></rect><rect x=\"27.5\" y=\"8.000000000000002\" width=\"20\" height=\"3.5999999999999996\" fill=\"currentColor\"><title>Phone, W2: 9</title></rect><rect x=\"52.5\" y=\"3.6000000000000014\" width=\"20\" height=\"6\" fill=\"currentColor\"><title>Phone, W3: 15</title></rect><rect x=\"77.5\" y=\"5.6\" width=\"20\" height=\"4.4\" fill=\"currentColor\"><title>Phone, W4: 11</title></rect></g></svg><div data-aui=\"chart-xlabels\"><div>W1</div><div>W2</div><div>W3</div><div>W4</div></div><div data-aui=\"chart-legend\"><span data-aui=\"chart-legend-item\" data-aui-series=\"0\"><span data-aui=\"chart-legend-swatch\"></span>Email</span><span data-aui=\"chart-legend-item\" data-aui-series=\"1\"><span data-aui=\"chart-legend-swatch\"></span>Chat</span><span data-aui=\"chart-legend-item\" data-aui-series=\"2\"><span data-aui=\"chart-legend-swatch\"></span>Phone</span></div></div></section></div></div></div><figcaption class=\"text-muted-foreground mt-2.5 text-xs\">fig. 01";

export function GenerativeChartBars({ className, children, ...props }) {
  return (
    <div
      data-slot="generative-chart-bars"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: GenerativeChartBarsHtml }} />
      )}
    </div>
  );
}

export default GenerativeChartBars;
