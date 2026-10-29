"use client";
import React, { useState } from "react";
import { MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

export interface GeoMapPlace {
  id: string;
  lat: number;
  lng: number;
  label: string;
  description?: string | undefined;
}

export interface GeoMapRoute {
  id: string;
  points: readonly (readonly [lat: number, lng: number])[];
  label?: string | undefined;
}

export function GeoMap({
  places = [],
  routes,
  selectedId,
  onSelect,
  height = 220,
  className,
  ...props
}: any) {
  const [internalId, setInternalId] = useState<string | undefined>(() => places[0]?.id);
  const activeId = selectedId ?? internalId ?? places[0]?.id;
  const activePlace = places.find((p: GeoMapPlace) => p.id === activeId) ?? places[0];

  return (
    <div
      data-slot="geo-map"
      className={cn(paper, "flex w-full max-w-md flex-col overflow-hidden rounded-2xl", className)}
      {...props}
    >
      <div
        style={{ height }}
        className="bg-foreground/[0.04] relative flex w-full items-center justify-center overflow-hidden"
      >
        <svg className="text-foreground/10 absolute inset-0 size-full" viewBox="0 0 400 220" fill="none">
          <path d="M0 55H400M0 110H400M0 165H400M80 0V220M160 0V220M240 0V220M320 0V220" stroke="currentColor" strokeWidth="1" />
        </svg>
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 p-4">
          {places.map((place: GeoMapPlace) => {
            const isSelected = place.id === activeId;
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => {
                  setInternalId(place.id);
                  onSelect?.(place.id);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-xs transition-all cursor-pointer",
                  isSelected
                    ? "bg-blue-500 text-white ring-2 ring-background"
                    : "bg-background/90 text-foreground border border-border/60 hover:bg-background"
                )}
              >
                <MapPinIcon className="size-3 shrink-0" />
                <span>{place.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {activePlace && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-[13.5px] font-medium">{activePlace.label}</p>
            {activePlace.description && (
              <p className="text-muted-foreground truncate text-xs">{activePlace.description}</p>
            )}
          </div>
          <span data-slot="geo-map-coordinates" className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}>
            {Number(activePlace.lat).toFixed(4)}, {Number(activePlace.lng).toFixed(4)}
          </span>
        </div>
      )}
    </div>
  );
}
export default GeoMap;
