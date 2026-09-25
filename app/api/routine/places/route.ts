import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, placeCreateSchema } from "@/lib/validation";
import { listPlaces, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (maps): the named places — Home, School, Tennis — a parent sets once
    so a position near one reads "near School". Read by anyone on the Well Being. */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req));
  return NextResponse.json(await listPlaces(person.id));
});

/** Name a spot, usually from a point on the day's log ("this is School"). Write access. */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  const parsed = await parseBody(req, placeCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { name, lat, lng, radiusM } = parsed.data;
  if (lat === 0 && lng === 0) return NextResponse.json({ error: "That spot has no position." }, { status: 400 });
  const same = await prisma.place.findFirst({ where: { personId: person.id, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (same) return NextResponse.json({ error: `There is already a place called ${name}.` }, { status: 409 });
  const place = await prisma.place.create({
    data: { personId: person.id, name, lat, lng, radiusM: radiusM ?? 150 },
    select: { id: true, name: true, lat: true, lng: true, radiusM: true },
  });
  return NextResponse.json(place, { status: 201 });
});
