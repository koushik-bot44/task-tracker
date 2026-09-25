import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { buildLocationDay, parseDayKey, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (maps): the person's own positions for one IST day
    (?day=YYYY-MM-DD, default today). The sharing link itself is never shown
    on this side — only whether sharing is on. */
export const GET = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = new URL(req.url).searchParams.get("day");
  const day = raw ? parseDayKey(raw) : todayKey();
  if (!day) return NextResponse.json({ error: "That is not a day." }, { status: 400 });

  return NextResponse.json(await buildLocationDay(person.id, day, { withUrl: false }));
});
