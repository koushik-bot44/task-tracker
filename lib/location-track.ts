/**
 * History without false lines (2026-09-29). Pure, tested in scripts/unit-location.ts.
 *
 * Points are joined into a route only when they are close in time and the
 * implied speed is plausible; everything else is a gap, shown as a gap. A
 * point with no position (a check-in the phone could not place) or a very
 * coarse one (> 1 km) is never part of a line.
 */

export type TrackPoint = { id: string; at: string; lat: number; lng: number; accuracy: number | null };
export type TrackGap = { fromId: string; toId: string; fromAt: string; toAt: string; minutes: number; km: number };
export type Track = { segments: string[][]; gaps: TrackGap[] };

/** Longer than this between two fixes is a gap. */
export const GAP_MS = 20 * 60_000;
/** Faster than this (m/s, ~250 km/h) between two fixes is not a route. */
export const MAX_SPEED_MPS = 70;
/** Coarser than this is shown as a dot, never joined into a line. */
export const MAX_ROUTE_ACCURACY_M = 1000;

export function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function buildTrack(points: TrackPoint[]): Track {
  const usable = points
    .filter((p) => !(p.lat === 0 && p.lng === 0) && (p.accuracy === null || p.accuracy <= MAX_ROUTE_ACCURACY_M))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const segments: string[][] = [];
  const gaps: TrackGap[] = [];
  let current: string[] = [];
  for (let i = 0; i < usable.length; i++) {
    const p = usable[i];
    if (i === 0) { current.push(p.id); continue; }
    const q = usable[i - 1];
    const dt = new Date(p.at).getTime() - new Date(q.at).getTime();
    const d = metres(q.lat, q.lng, p.lat, p.lng);
    const speed = dt > 0 ? d / (dt / 1000) : d > 50 ? Infinity : 0;
    if (dt > GAP_MS || speed > MAX_SPEED_MPS) {
      segments.push(current);
      gaps.push({ fromId: q.id, toId: p.id, fromAt: q.at, toAt: p.at, minutes: Math.round(dt / 60_000), km: Math.round(d / 100) / 10 });
      current = [p.id];
    } else {
      current.push(p.id);
    }
  }
  if (current.length) segments.push(current);
  return { segments, gaps };
}
