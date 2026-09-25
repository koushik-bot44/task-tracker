import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { parseBody, pingSchema } from "@/lib/validation";
import { serializeLocation } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Two app notes in ten minutes say nothing new: the second is answered with the first. */
const PING_GAP_MS = 10 * 60_000;

/** 2026-09-25 (maps): the app itself noting where he is — when he opens it, and on
    the hour while it stays open — after he allowed it once on the phone. Nothing but
    a position comes in; a note within ten minutes of the last one is not stored again. */
export const POST = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, pingSchema);
  if (!parsed.ok) return parsed.response;
  const { lat, lng, accuracy } = parsed.data;
  if (lat === 0 && lng === 0) return NextResponse.json({ error: "That is not a position." }, { status: 400 });

  const recent = await prisma.locationPoint.findFirst({
    where: { personId: person.id, source: "APP", at: { gte: new Date(Date.now() - PING_GAP_MS) } },
    orderBy: { at: "desc" },
  });
  if (recent) return NextResponse.json(serializeLocation(recent));

  const point = await prisma.locationPoint.create({
    data: { personId: person.id, at: new Date(), lat, lng, accuracy: typeof accuracy === "number" ? accuracy : null, battery: null, source: "APP", place: null, note: null },
  });
  return NextResponse.json(serializeLocation(point), { status: 201 });
});
