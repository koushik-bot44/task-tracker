import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { buildCalendarMonth, monthKeyOf, parseMonthKey, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The person's own month calendar (2026-09-25): their tasks, the tutors' reports,
    and the rules scheduled each day — never the habit rollup. */
export const GET = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const raw = new URL(req.url).searchParams.get("month");
  const month = raw ? parseMonthKey(raw) : monthKeyOf(todayKey());
  if (!month) return NextResponse.json({ error: "That is not a month." }, { status: 400 });
  return NextResponse.json(await buildCalendarMonth(person.id, month, { withHabits: false }));
});
