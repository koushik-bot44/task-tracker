import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, weightCreateSchema } from "@/lib/validation";
import { dateToKey, dayKeyToDate, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Log a weight entry for the manager's own person (manager-only feature). */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, weightCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { date, weightKg } = parsed.data;

  const entry = await prisma.weightEntry.create({
    data: { personId: person.id, date: dayKeyToDate(date), weightKg },
    select: { id: true, date: true, weightKg: true },
  });
  return NextResponse.json({ id: entry.id, date: dateToKey(entry.date), weightKg: entry.weightKg }, { status: 201 });
});
