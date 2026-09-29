import { NextResponse } from "next/server";
import { requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import { requestLocateNow } from "@/lib/device-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P6 — Locate Now. Asks the phone for a fresh position (instantly when push is
    set up, otherwise at its next check-in). One at a time; 20 an hour. The
    answer is the request, never a made-up position. */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  const { request, reused } = await requestLocateNow(person.id, actor.id);
  return NextResponse.json({ request, reused }, { status: reused ? 200 : 202 });
});
