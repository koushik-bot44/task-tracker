import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Remove one of the manager's person's tasks (scoped to their own person -> 404). */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  const task = await prisma.routineTask.findFirst({ where: { id: params.id, personId: person.id }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  await prisma.routineTask.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
