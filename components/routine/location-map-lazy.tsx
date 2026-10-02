"use client";

import dynamic from "next/dynamic";
import { ChunkErrorBoundary } from "@/components/chunk-error-boundary";
import type { LocationDayDTO, LocationPointDTO } from "@/lib/types";

/* The map only in the browser (2026-09-25): Leaflet reads `window` as it loads,
   so screens import THIS, never ./location-map itself. The grey box stands in
   while the map code arrives. If it never arrives (a page left open across a
   deploy, 2026-10-02), the box says "Map couldn't load" — the screen stays. */
const Inner = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-card bg-surface-2" aria-hidden />,
});

export const LocationMapLazy = ({
  points,
  height = 260,
  mode = "current",
  track,
}: {
  points: LocationPointDTO[];
  height?: number;
  mode?: "current" | "history";
  track?: LocationDayDTO["track"];
}) => (
  <div className="w-full" style={{ height }}>
    <ChunkErrorBoundary what="Map">
      <Inner points={points} height={height} mode={mode} track={track} />
    </ChunkErrorBoundary>
  </div>
);
