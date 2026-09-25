"use client";

import dynamic from "next/dynamic";
import type { LocationPointDTO } from "@/lib/types";

/* The map only in the browser (2026-09-25): Leaflet reads `window` as it loads,
   so screens import THIS, never ./location-map itself. The grey box stands in
   while the map code arrives. */
const Inner = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-card bg-surface-2" aria-hidden />,
});

export const LocationMapLazy = ({ points, height = 260 }: { points: LocationPointDTO[]; height?: number }) => (
  <div className="w-full" style={{ height }}>
    <Inner points={points} height={height} />
  </div>
);
