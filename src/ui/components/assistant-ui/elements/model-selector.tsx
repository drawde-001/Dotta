"use client";
import React from "react";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono } from "./surfaces";

export function ModelSelector({ models = [], value, onValueChange, className, ...props }: any) {
  const current = models.find((m: any) => m.id === value || m.name === value) || models[0] || { name: value || "Muse Spark" };
  return (
    <div
      data-slot="model-selector"
      className={cn(field, "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium", className)}
      {...props}
    >
      <SparklesIcon className="size-3.5 text-muted-foreground" />
      <span>{current.name || current.label || "Model"}</span>
      {current.meta && <span className={cn(mono, "text-muted-foreground")}>{current.meta}</span>}
      <ChevronDownIcon className="size-3 text-muted-foreground" />
    </div>
  );
}
export default ModelSelector;
