import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { checkinSchema, parseBody } from "@/lib/validation";
import { serializeLocation } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (maps): the person taps "Check in" — a place, an optional note,
    and the phone's position when the browser allowed it. A check-in with no
    coordinates still counts (lat/lng 0,0 is never drawn as a real spot). */
export const POST = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, checkinSchema);
  if (!parsed.ok) return parsed.response;
  const { place, note, lat, lng, accuracy } = parsed.data;
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  const point = await prisma.locationPoint.create({
    data: {
      personId: person.id,
      at: new Date(),
      lat: hasCoords ? lat : 0,
      lng: hasCoords ? lng : 0,
      accuracy: hasCoords && typeof accuracy === "number" ? accuracy : null,
      battery: null,
      source: "CHECKIN",
      place,
      note: note && note.length > 0 ? note : null,
    },
  });
  return NextResponse.json(serializeLocation(point), { status: 201 });
});
