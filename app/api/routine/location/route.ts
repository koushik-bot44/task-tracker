import { NextResponse } from "next/server";
import { requireManager, route } from "@/lib/session";
import { buildLocationDay, parseDayKey, personParam, requireRoutineAccess, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (maps): the parent side — one IST day of the person's positions
    (?day=YYYY-MM-DD, default today), the latest point ever, and whether phone
    sharing is on. The sharing link travels only to the owner. */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const { person, role } = await requireRoutineAccess(actor.id, personParam(req));

  const raw = new URL(req.url).searchParams.get("day");
  const day = raw ? parseDayKey(raw) : todayKey();
  if (!day) return NextResponse.json({ error: "That is not a day." }, { status: 400 });

  return NextResponse.json(await buildLocationDay(person.id, day, { withUrl: role === "OWNER" }));
});
