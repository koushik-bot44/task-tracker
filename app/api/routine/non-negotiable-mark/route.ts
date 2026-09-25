import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { nonNegotiableCrossSchema, parseBody } from "@/lib/validation";
import { dayKeyToDate, requireOwnNonNegotiable, personParam, requireRoutineAccess, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2026-09-25 (the Family Routine Agreement): a non-negotiable holds every day and
    is logged ONLY when crossed. crossed=true writes that day's log line (never a
    day that has not come); crossed=false takes it away. Parent side only — the
    person sees the log, read-only. Scoped to the accessible routine (404 otherwise). */
export const PATCH = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, nonNegotiableCrossSchema);
  if (!parsed.ok) return parsed.response;
  const { nonNegotiableId, date, crossed } = parsed.data;
  await requireOwnNonNegotiable(person.id, nonNegotiableId);
  if (crossed && date > todayKey()) return NextResponse.json({ error: "That day has not come yet." }, { status: 400 });
  const day = dayKeyToDate(date);

  if (!crossed) {
    await prisma.nonNegotiableMark.deleteMany({ where: { nonNegotiableId, date: day } });
    return NextResponse.json({ ok: true, crossed: false });
  }
  await prisma.nonNegotiableMark.upsert({
    where: { nonNegotiableId_date: { nonNegotiableId, date: day } },
    create: { nonNegotiableId, date: day, crossed: true },
    update: { crossed: true },
  });
  return NextResponse.json({ ok: true, crossed: true });
});
