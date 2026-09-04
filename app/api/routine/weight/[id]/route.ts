import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, weightUpdateSchema } from "@/lib/validation";
import { dateToKey, dayKeyToDate, personParam, requireRoutineAccess, requireOwnWeight } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Edit a weight entry (own person only). */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await requireOwnWeight(person.id, params.id);

  const parsed = await parseBody(req, weightUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { date, weightKg } = parsed.data;
  const entry = await prisma.weightEntry.update({
    where: { id: params.id },
    data: { ...(date !== undefined ? { date: dayKeyToDate(date) } : {}), ...(weightKg !== undefined ? { weightKg } : {}) },
    select: { id: true, date: true, weightKg: true },
  });
  return NextResponse.json({ id: entry.id, date: dateToKey(entry.date), weightKg: entry.weightKg });
});

/** Delete a weight entry (own person only). */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await requireOwnWeight(person.id, params.id);
  await prisma.weightEntry.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
