import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePerson, route } from "@/lib/session";
import { badRequest, habitMarkSchema, parseBody } from "@/lib/validation";
import { dayKeyToDate, requireOwnHabit, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The person marks THEIR OWN habit (phase 37) — the second and last thing a PERSON
 * writes (tasks being the first). requirePerson, then the habit must belong to the
 * Person linked to this login (habit.segment.person === caller's person) else 404.
 * Value is MET|MISSED|NA or null (clear). The date may not be in the future.
 *
 * This is MARK-ONLY: no segment/habit structure, target, non-negotiable, or weight
 * write is reachable here. It UPSERTs the SAME HabitMark row the manager writes
 * (@@unique habitId+date) — last write wins, one shared value, no duplicate rows.
 */
export const POST = route(async (req: Request) => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await parseBody(req, habitMarkSchema);
  if (!parsed.ok) return parsed.response;
  const { habitId, date, value } = parsed.data;

  // Own-habit-only (mark another person's habit -> 404). Reuses the same guard the
  // manager endpoint uses, scoped to THIS caller's person.
  await requireOwnHabit(person.id, habitId);

  // The person can only mark days up to today (no pre-marking the future).
  if (date > todayKey()) {
    return badRequest([{ path: ["date"], message: "Can't mark a future day." }]);
  }

  const day = dayKeyToDate(date);
  if (value === null) {
    await prisma.habitMark.deleteMany({ where: { habitId, date: day } });
    return NextResponse.json({ ok: true, value: null });
  }
  await prisma.habitMark.upsert({
    where: { habitId_date: { habitId, date: day } },
    create: { habitId, date: day, value },
    update: { value },
  });
  return NextResponse.json({ ok: true, value });
});
