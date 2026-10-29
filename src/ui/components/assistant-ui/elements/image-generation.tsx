"use client";

import type { ComponentProps } from "react";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, mono, paper, ShimmerLabel } from "./surfaces";
import { ImageZoom } from "./image";

const DOTS = Array.from({ length: 64 }, (_, i) => i);

export function ImageGeneration({
  prompt,
  generating,
  imageUrl,
  url,
  sizeLabel,
  onRegenerate,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "prompt" | "generating" | "onRegenerate"
> & {
  prompt: string;
  generating: boolean;
  imageUrl?: string | undefined;
  url?: string | undefined;
  sizeLabel?: string | undefined;
  onRegenerate?: () => void;
}) {
  const resolvedUrl = imageUrl || url;
  const displaySize = sizeLabel ? sizeLabel.replace("x", " × ") : "1024 × 1024";

  const previewCard = (
    <div
      className={cn(
        paper,
        "relative aspect-square w-full overflow-hidden rounded-2xl",
      )}
    >
      <div
        className="absolute inset-0 grid grid-cols-8 place-items-center p-6"
        aria-hidden
      >
        {DOTS.map((dot) => {
          const row = Math.floor(dot / 8);
          const col = dot % 8;
          return (
            <span
              key={dot}
              className={cn(
                "bg-foreground/20 size-1 rounded-full transition-opacity duration-500",
                generating
                  ? "animate-pulse motion-reduce:animate-none"
                  : "opacity-0",
              )}
              style={{ animationDelay: `${(row + col) * 90}ms` }}
            />
          );
        })}
      </div>
      {resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt={prompt || "Generated image"}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-700 ease-out motion-reduce:transition-none",
            generating ? "opacity-0 blur-xl" : "blur-0 opacity-100",
          )}
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 transition-[opacity,filter] duration-1000 ease-out motion-reduce:transition-none",
            generating ? "opacity-0 blur-xl" : "blur-0 opacity-100",
          )}
          style={{
            background:
              "radial-gradient(120% 90% at 20% 100%, oklch(0.45 0.09 265) 0%, transparent 55%), radial-gradient(110% 80% at 85% 90%, oklch(0.62 0.1 300 / 0.8) 0%, transparent 60%), radial-gradient(130% 100% at 60% 0%, oklch(0.88 0.06 60) 0%, oklch(0.74 0.09 25 / 0.9) 45%, transparent 75%), linear-gradient(to top, oklch(0.35 0.06 275), oklch(0.82 0.07 50))",
          }}
        />
      )}
      <span
        className={cn(
          mono,
          "absolute end-2.5 top-2.5 rounded-md bg-black/35 px-1.5 py-0.5 backdrop-blur-xs tabular-nums",
          generating ? "text-muted-foreground bg-transparent" : "text-white/85",
        )}
      >
        {displaySize}
      </span>
    </div>
  );

  return (
    <div
      data-slot="image-generation"
      className={cn(
        "flex flex-col gap-2.5",
        resolvedUrl ? "w-72 sm:w-80" : "w-52",
        className,
      )}
      {...props}
    >
      {resolvedUrl && !generating ? (
        <ImageZoom src={resolvedUrl} alt={prompt || "Generated image"}>
          {previewCard}
        </ImageZoom>
      ) : (
        previewCard
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs" title={prompt}>
          {generating ? (
            <ShimmerLabel className="relative">Generating</ShimmerLabel>
          ) : (
            prompt
          )}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {resolvedUrl && !generating && (
            <a
              href={resolvedUrl}
              download={`muse-image-${Date.now()}.webp`}
              aria-label="Download generated image"
              title="Download image"
              className={cn(ghostButton, "size-6 shrink-0 flex items-center justify-center")}
            >
              <DownloadIcon className="size-3" />
            </a>
          )}
          {onRegenerate && (
            <button
              type="button"
              aria-label="Regenerate image"
              aria-hidden={generating || undefined}
              disabled={generating}
              onClick={onRegenerate}
              className={cn(
                ghostButton,
                "size-6 shrink-0",
                generating && "pointer-events-none opacity-0",
              )}
            >
              <RefreshCwIcon className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

