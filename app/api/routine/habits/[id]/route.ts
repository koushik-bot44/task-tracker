import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { habitUpdateSchema, parseBody } from "@/lib/validation";
import { requireOwnHabit, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Rename a habit / set its weekly target / toggle active (own person only). */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await requireOwnHabit(person.id, params.id);

  const parsed = await parseBody(req, habitUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { name, targetPerWeek, active } = parsed.data;
  await prisma.habit.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(targetPerWeek !== undefined ? { targetPerWeek } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  return NextResponse.json({ ok: true });
});

/** Remove a habit and its marks (cascade). */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await requireOwnHabit(person.id, params.id);
  await prisma.habit.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
