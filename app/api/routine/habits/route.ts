import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { habitCreateSchema, parseBody } from "@/lib/validation";
import { appendOrderKey, personParam, requireRoutineAccess, requireOwnSegment } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a habit to one of the manager's own person's segments. */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, habitCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { segmentId, name, targetPerWeek } = parsed.data;
  await requireOwnSegment(person.id, segmentId);

  const siblings = await prisma.habit.findMany({ where: { segmentId }, select: { orderKey: true } });
  const habit = await prisma.habit.create({
    data: { segmentId, name, targetPerWeek: targetPerWeek ?? 7, orderKey: appendOrderKey(siblings.map((h) => h.orderKey)) },
    select: { id: true, segmentId: true, name: true, targetPerWeek: true, orderKey: true, active: true },
  });
  return NextResponse.json({ ...habit, marks: {}, metThisWeek: 0 }, { status: 201 });
});
