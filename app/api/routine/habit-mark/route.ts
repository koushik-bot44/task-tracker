import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { habitMarkSchema, parseBody } from "@/lib/validation";
import { dayKeyToDate, requireOwnHabit, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Set a habit's three-state daily mark. value null clears it (back to empty).
    Scoped to the manager's own person; the habit must be theirs (404 otherwise). */
export const PATCH = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, habitMarkSchema);
  if (!parsed.ok) return parsed.response;
  const { habitId, date, value } = parsed.data;
  await requireOwnHabit(person.id, habitId);
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
