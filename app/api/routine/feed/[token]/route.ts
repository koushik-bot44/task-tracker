import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { istDayRange } from "@/lib/timezone";
import { todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (maps): where a location app on the person's phone posts its
    position. PUBLIC — the secret in the path is the whole authorisation (the
    middleware lets /api/routine/feed through). Two payload shapes:
      OwnTracks  {_type:"location", lat, lon, tst, acc?, batt?}  -> answers []
      Overland   {locations:[{geometry:{coordinates:[lng,lat]}, properties:{timestamp,...}}]} -> {result:"ok"}
    Anything else is 400. Bad coordinates are skipped, never stored. Past 1000
    points in one IST day the rest are accepted and dropped, so a runaway phone
    cannot fill the database. Nothing about the person or the token is logged. */

/** A day's cap on stored points per person. */
const DAY_CAP = 1000;

type Incoming = { at: Date; lat: number; lng: number; accuracy: number | null; battery: number | null; source: "OWNTRACKS" | "OVERLAND" };

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const isLat = (n: number | null): n is number => n !== null && n >= -90 && n <= 90;
const isLng = (n: number | null): n is number => n !== null && n >= -180 && n <= 180;
const clampBattery = (n: number | null): number | null => (n === null ? null : Math.max(0, Math.min(100, Math.round(n))));
const nonNegative = (n: number | null): number | null => (n === null || n < 0 ? null : n);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** OwnTracks: one point per post; `tst` is unix seconds, `batt` is 0..100. */
function fromOwnTracks(body: Record<string, unknown>): Incoming | null {
  const lat = num(body.lat);
  const lng = num(body.lon);
  if (!isLat(lat) || !isLng(lng)) return null;
  const tst = num(body.tst);
  const at = tst !== null && tst > 0 ? new Date(tst * 1000) : new Date();
  if (Number.isNaN(at.getTime())) return null;
  return { at, lat, lng, accuracy: nonNegative(num(body.acc)), battery: clampBattery(num(body.batt)), source: "OWNTRACKS" };
}

/** Overland: a batch of GeoJSON points; `battery_level` is 0..1. */
function fromOverland(item: unknown): Incoming | null {
  if (!isRecord(item)) return null;
  const geometry = isRecord(item.geometry) ? item.geometry : null;
  const props = isRecord(item.properties) ? item.properties : {};
  const coords = geometry && Array.isArray(geometry.coordinates) ? geometry.coordinates : null;
  if (!coords || coords.length < 2) return null;
  const lng = num(coords[0]);
  const lat = num(coords[1]);
  if (!isLat(lat) || !isLng(lng)) return null;
  const ts = typeof props.timestamp === "string" ? new Date(props.timestamp) : null;
  const at = ts && !Number.isNaN(ts.getTime()) ? ts : new Date();
  const level = num(props.battery_level);
  return {
    at,
    lat,
    lng,
    accuracy: nonNegative(num(props.horizontal_accuracy)),
    battery: level === null ? null : clampBattery(level * 100),
    source: "OVERLAND",
  };
}

/** A phone's clock can be a little off; a position "from the future" beyond that
    is a bad payload and would sit as "last seen" forever (rig, 2026-09-25). */
const FUTURE_GRACE_MS = 10 * 60_000;
/** Nothing before this is a phone position; it also catches a `tst` sent in
    milliseconds or a timestamp that did not parse (review, 2026-09-25). */
const OLDEST_MS = Date.UTC(2020, 0, 1);

async function store(personId: string, incoming: Incoming[]) {
  const limit = Date.now() + FUTURE_GRACE_MS;
  const points = incoming.filter((p) => Number.isFinite(p.at.getTime()) && p.at.getTime() >= OLDEST_MS && p.at.getTime() <= limit);
  if (points.length === 0) return;
  const { start, end } = istDayRange(todayKey());
  const already = await prisma.locationPoint.count({ where: { personId, source: { in: ["OWNTRACKS", "OVERLAND"] }, at: { gte: start, lte: end } } });
  const room = Math.max(0, DAY_CAP - already);
  if (room === 0) return;
  const keep = points.slice(0, room);
  await prisma.locationPoint.createMany({ data: keep.map((p) => ({ personId, ...p })) });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const token = typeof params?.token === "string" ? params.token : "";
  // Plausible token shape only — never hand an arbitrary string to the database lookup.
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return NextResponse.json({ error: "Unknown link." }, { status: 404 });
  const person = await prisma.person.findUnique({ where: { feedToken: token }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Unknown link." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Not a location." }, { status: 400 });
  }
  if (!isRecord(body)) return NextResponse.json({ error: "Not a location." }, { status: 400 });

  try {
    // Shape A — OwnTracks. Every _type answers [] (the app expects that); only "location" stores.
    if (typeof body._type === "string") {
      if (body._type === "location") {
        const point = fromOwnTracks(body);
        if (point) await store(person.id, [point]);
      }
      return NextResponse.json([]);
    }
    // Shape B — Overland.
    if (Array.isArray(body.locations)) {
      const points = body.locations.map(fromOverland).filter((p): p is Incoming => p !== null);
      await store(person.id, points);
      return NextResponse.json({ result: "ok" });
    }
  } catch {
    // Nothing about the person or the link goes to the log.
    console.error("[feed] could not store a position");
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  return NextResponse.json({ error: "Not a location." }, { status: 400 });
}
