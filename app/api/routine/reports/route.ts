import { NextResponse } from "next/server";
import { requireManager, route } from "@/lib/session";
import { listLatestReports, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25: everything the tutors punched in, newest first (the last hundred),
    for the parents' Tutors tab. The Summary shows only today's; this is the rest. */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req));
  return NextResponse.json({ reports: await listLatestReports(person.id, 100) });
});
