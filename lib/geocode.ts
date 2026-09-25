import { prisma } from "@/lib/prisma";

/**
 * The map's own name for a spot (2026-09-25): OpenStreetMap's free lookup, asked
 * politely — one request a second, a named user agent, and every answer cached by
 * position rounded to about 100 m (GeoName), so a spot is looked up once. The
 * label is short and the way a person says it: "Mindspace, Madhapur",
 * "HITEC City Road, Madhapur", "Vittal Rao Nagar, Madhapur". "" = nothing known.
 */
const AGENT = "Orbit family app (self-hosted; contact via the app owner)";
const MIN_GAP_MS = 1100;
let lastCall = 0;

/** ~100 m cells: three decimals of a degree. */
export function geoKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

type Address = Record<string, string | undefined>;
function shortLabel(body: { name?: string; address?: Address }): string {
  const a = body.address ?? {};
  const spot = body.name || a.amenity || a.building || a.office || a.shop || a.leisure || a.tourism || a.commercial || a.residential || a.road || "";
  const area = a.neighbourhood || a.suburb || a.village || a.town || a.city_district || "";
  if (spot && area && spot !== area) return `${spot}, ${area}`;
  return spot || area || "";
}

async function ask(lat: number, lng: number): Promise<string> {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { "User-Agent": AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  const body = (await res.json()) as { name?: string; address?: Address; error?: string };
  if (body.error) return "";
  return shortLabel(body).slice(0, 80);
}

/** The cached name for a spot, or a fresh lookup (stored). Never throws: null when
    the lookup could not be made right now (it is tried again later). */
export async function placeNameFor(lat: number, lng: number): Promise<string | null> {
  if (lat === 0 && lng === 0) return "";
  const key = geoKey(lat, lng);
  const hit = await prisma.geoName.findUnique({ where: { key }, select: { label: true } });
  if (hit) return hit.label;
  try {
    const label = await ask(lat, lng);
    await prisma.geoName.upsert({ where: { key }, create: { key, label }, update: {} });
    return label;
  } catch {
    return null;
  }
}

/** Give up to `limit` of these points their map name (those still null), in order. */
export async function namePoints(points: { id: string; lat: number; lng: number; placeName: string | null }[], limit = 3): Promise<Map<string, string>> {
  const named = new Map<string, string>();
  let budget = limit;
  for (const p of points) {
    if (p.placeName !== null) continue;
    if (budget-- <= 0) break;
    const label = await placeNameFor(p.lat, p.lng);
    if (label === null) continue;
    await prisma.locationPoint.update({ where: { id: p.id }, data: { placeName: label } });
    named.set(p.id, label);
  }
  return named;
}
