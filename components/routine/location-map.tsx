"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { LocationPointDTO, PlaceDTO } from "@/lib/types";

/* The map itself (2026-09-25). Leaflet touches `window` the moment it loads, so
   this file is only ever reached through ./location-map-lazy (no server render).
   Every mark is a drawn circle — never Leaflet's image marker, whose icon paths
   break under the bundler. */

const HYDERABAD: L.LatLngTuple = [17.4435, 78.3772];
const CHECKIN_COLOUR = "#0F766E";
const PHONE_COLOUR = "#14B8A6";
const APP_COLOUR = "#2563eb";
const PLACE_COLOUR = "#7c3aed";

/** "8:12 am" in IST from an ISO instant. */
export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** A check-in the phone could not place is stored at 0,0 — never a real spot here. */
export const hasSpot = (p: LocationPointDTO) => !(p.lat === 0 && p.lng === 0);

export default function LocationMap({ points, places = [], height = 260 }: { points: LocationPointDTO[]; places?: PlaceDTO[]; height?: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Make the map once; tear it down with the element.
  useEffect(() => {
    const el = elRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(HYDERABAD, 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;
    // A map born inside a hidden tab measures itself wrong; re-measure whenever the box changes.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(el);
    const t = window.setTimeout(() => map.invalidateSize(), 50);
    return () => {
      window.clearTimeout(t);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraw whenever the points change.
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
    // Oldest first, so the phone's trail reads in time order.
    const ordered = [...drawable].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const trail: L.LatLngTuple[] = [];
    // The named places first, as soft rings under everything.
    for (const pl of places) {
      L.circle([pl.lat, pl.lng], { radius: pl.radiusM, color: PLACE_COLOUR, weight: 1, opacity: 0.6, fillColor: PLACE_COLOUR, fillOpacity: 0.08, interactive: false })
        .bindTooltip(escapeHtml(pl.name), { permanent: true, direction: "center", className: "wb-place-label" })
        .addTo(layer);
    }
    // Times on the pins: every check-in and app note carries its time; the phone's
    // trail shows a time on tap, plus on its first and last point.
    for (const [i, p] of ordered.entries()) {
      const pos: L.LatLngTuple = [p.lat, p.lng];
      const where = p.placeName ? p.placeName : p.source === "CHECKIN" && p.place ? p.place : p.near ? `near ${p.near}` : "";
      const time = clockTime(p.at);
      if (p.source === "CHECKIN" || p.source === "APP") {
        const colour = p.source === "CHECKIN" ? CHECKIN_COLOUR : APP_COLOUR;
        const note = p.note ? `<br/><span style="opacity:.75">${escapeHtml(p.note)}</span>` : "";
        L.circleMarker(pos, { radius: 9, color: colour, fillColor: colour, fillOpacity: 0.9, weight: 2 })
          .bindTooltip(`${time}${where ? ` · ${escapeHtml(where)}` : ""}`, { permanent: true, direction: "top", offset: [0, -8], className: "wb-time-label" })
          .bindPopup(`<strong>${escapeHtml(where || (p.source === "APP" ? "App" : "Check-in"))} · ${time}</strong>${note}`)
          .addTo(layer);
      } else {
        trail.push(pos);
        const edge = i === 0 || i === ordered.length - 1;
        const m = L.circleMarker(pos, { radius: 4, color: PHONE_COLOUR, fillColor: PHONE_COLOUR, fillOpacity: 0.7, weight: 1 }).bindPopup(`${time}${where ? ` · ${escapeHtml(where)}` : ""}`);
        if (edge) m.bindTooltip(time, { permanent: true, direction: "right", offset: [6, 0], className: "wb-time-label" });
        m.addTo(layer);
      }
    }
    if (trail.length > 1) L.polyline(trail, { weight: 3, color: PHONE_COLOUR, opacity: 0.6 }).addTo(layer);
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(ordered.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [24, 24], maxZoom: 16 });
  }, [points, places]);

  const empty = !points.some(hasSpot);

  return (
    <div className="wb-map relative w-full overflow-hidden rounded-card border border-line" style={{ height }}>
      {/* Leaflet's zoom buttons are 30px; on a phone they get the house's 44px. */}
      <style>{`.wb-map .leaflet-bar a { width: 44px; height: 44px; line-height: 44px; font-size: 22px; }
.wb-map .wb-time-label { background: rgba(255,255,255,.92); border: 1px solid rgba(15,23,42,.15); border-radius: 8px; padding: 2px 6px; font: 600 12px/1.2 var(--font-sans, Inter, sans-serif); color: #16255b; box-shadow: none; }
.wb-map .wb-time-label::before { display: none; }
.wb-map .wb-place-label { background: transparent; border: 0; box-shadow: none; font: 600 12px/1.2 var(--font-sans, Inter, sans-serif); color: #7c3aed; text-shadow: 0 0 3px #fff, 0 0 3px #fff; }
.wb-map .wb-place-label::before { display: none; }`}</style>
      <div ref={elRef} className={empty ? "h-full w-full opacity-50" : "h-full w-full"} style={{ height }} aria-label="Map" />
      {empty ? (
        <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
          <p className="rounded-card bg-surface px-4 py-2 text-sm font-medium text-ink shadow-e1">No location yet.</p>
        </div>
      ) : null}
    </div>
  );
}
