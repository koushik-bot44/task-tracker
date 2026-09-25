import { NextResponse } from "next/server";
import { requireManager, route } from "@/lib/session";
import { buildCalendarMonth, monthKeyOf, parseMonthKey, personParam, requireRoutineAccess, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The parent side's month calendar (2026-09-25): tasks by due day, tutor reports,
    scheduled rules and the day's habit marks. ?month=YYYY-MM, default now. */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req));
  const raw = new URL(req.url).searchParams.get("month");
  const month = raw ? parseMonthKey(raw) : monthKeyOf(todayKey());
  if (!month) return NextResponse.json({ error: "That is not a month." }, { status: 400 });
  return NextResponse.json(await buildCalendarMonth(person.id, month, { withHabits: true }));
});
