"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { LocationDayDTO, LocationPointDTO } from "@/lib/types";

/* The map itself (2026-09-25; two modes since 2026-09-29). Leaflet touches
   `window` the moment it loads, so this file is only ever reached through
   ./location-map-lazy (no server render). Every mark is a drawn circle — never
   Leaflet's image marker, whose icon paths break under the bundler.

   "current": one position, with a circle as wide as its accuracy — the honest
   size of "here".
   "history": the day's route, drawn ONLY between fixes that are close in time
   and plausibly reachable (lib/location-track.ts); across a gap the line is
   dashed and grey and says how long nothing came in. Never a solid line through
   missing data. */

const HYDERABAD: L.LatLngTuple = [17.4435, 78.3772];
const COLOUR: Record<string, string> = { DEVICE: "#2563eb", CHECKIN: "#0F766E", APP: "#7c3aed", OWNTRACKS: "#14B8A6", OVERLAND: "#14B8A6" };
const ROUTE = "#2563eb";
const GAP = "#64748b";

/** "8:12 am" in IST from an ISO instant. */
export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** A check-in the phone could not place is stored at 0,0 — never a real spot here. */
export const hasSpot = (p: LocationPointDTO) => !(p.lat === 0 && p.lng === 0);

const whereOf = (p: LocationPointDTO) => (p.placeName ? p.placeName : p.source === "CHECKIN" && p.place ? p.place : "");
const gapWords = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim());

export default function LocationMap({
  points,
  height = 260,
  mode = "current",
  track,
}: {
  points: LocationPointDTO[];
  height?: number;
  mode?: "current" | "history";
  track?: LocationDayDTO["track"];
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView(HYDERABAD, 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const drawable = points.filter(hasSpot);
    if (drawable.length === 0) {
      map.setView(HYDERABAD, 11);
      return;
    }
    map.invalidateSize();

    if (mode === "current") {
      const p = drawable[0];
      const pos: L.LatLngTuple = [p.lat, p.lng];
      const colour = COLOUR[p.source] ?? ROUTE;
      const where = whereOf(p);
      let bounds = L.latLngBounds([pos, pos]);
      if (p.accuracy && p.accuracy > 0) {
        const ring = L.circle(pos, { radius: p.accuracy, color: colour, weight: 1, opacity: 0.6, fillColor: colour, fillOpacity: 0.12, interactive: false }).addTo(layer);
        bounds = ring.getBounds();
      }
      L.circleMarker(pos, { radius: 9, color: "#fff", weight: 3, fillColor: colour, fillOpacity: 1 })
        .bindTooltip(`${clockTime(p.at)}${where ? ` · ${escapeHtml(where)}` : ""}`, { permanent: true, direction: "top", offset: [0, -10], className: "wb-time-label" })
        .addTo(layer);
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 17 });
      return;
    }

    // History: the route only where the data is continuous; gaps dashed and named.
    const byId = new Map(drawable.map((p) => [p.id, p]));
    for (const seg of track?.segments ?? []) {
      const line = seg.map((id) => byId.get(id)).filter((p): p is LocationPointDTO => Boolean(p)).map((p) => [p.lat, p.lng] as L.LatLngTuple);
      if (line.length > 1) L.polyline(line, { color: ROUTE, weight: 4, opacity: 0.75 }).addTo(layer);
    }
    for (const g of track?.gaps ?? []) {
      const a = byId.get(g.fromId);
      const b = byId.get(g.toId);
      if (!a || !b) continue;
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: GAP, weight: 2, opacity: 0.8, dashArray: "6 8" })
        .bindTooltip(`No data for ${gapWords(g.minutes)} — the route in between is unknown`, { sticky: true })
        .addTo(layer);
    }
    const ordered = [...drawable].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
    ordered.forEach((p, i) => {
      const colour = COLOUR[p.source] ?? ROUTE;
      const coarse = (p.accuracy ?? 0) > 1000;
      const where = whereOf(p);
      const m = L.circleMarker([p.lat, p.lng], { radius: p.source === "DEVICE" ? 4 : 7, color: colour, weight: coarse ? 2 : 1, fillColor: colour, fillOpacity: coarse ? 0 : 0.85 })
        .bindPopup(`<strong>${clockTime(p.at)}</strong>${where ? ` · ${escapeHtml(where)}` : ""}${p.accuracy ? `<br/><span style="opacity:.75">±${Math.round(p.accuracy)} m</span>` : ""}`);
      if (i === 0 || i === ordered.length - 1) m.bindTooltip(clockTime(p.at), { permanent: true, direction: "right", offset: [6, 0], className: "wb-time-label" });
      m.addTo(layer);
    });
    map.fitBounds(L.latLngBounds(ordered.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [24, 24], maxZoom: 16 });
  }, [points, mode, track]);

  const empty = !points.some(hasSpot);

  return (
    <div className="wb-map relative w-full overflow-hidden rounded-card border border-line" style={{ height }}>
      {/* Leaflet's zoom buttons are 30px; on a phone they get the house's 44px. */}
      <style>{`.wb-map .leaflet-bar a { width: 44px; height: 44px; line-height: 44px; font-size: 22px; }
.wb-map .wb-time-label { background: rgba(255,255,255,.92); border: 1px solid rgba(15,23,42,.15); border-radius: 8px; padding: 2px 6px; font: 600 12px/1.2 var(--font-sans, Inter, sans-serif); color: #16255b; box-shadow: none; }
.wb-map .wb-time-label::before { display: none; }`}</style>
      <div ref={elRef} className={empty ? "h-full w-full opacity-50" : "h-full w-full"} style={{ height }} aria-label={mode === "current" ? "Map of the latest position" : "Map of the day's route"} />
      {empty ? (
        <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
          <p className="rounded-card bg-surface px-4 py-2 text-sm font-medium text-ink shadow-e1">{mode === "current" ? "No location yet." : "Nothing on this day."}</p>
        </div>
      ) : null}
    </div>
  );
}
