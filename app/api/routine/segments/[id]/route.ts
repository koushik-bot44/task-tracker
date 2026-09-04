import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, segmentUpdateSchema } from "@/lib/validation";
import { personParam, requireRoutineAccess, requireOwnSegment } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Rename a segment (scoped to the manager's own person). */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await requireOwnSegment(person.id, params.id);

  const parsed = await parseBody(req, segmentUpdateSchema);
  if (!parsed.ok) return parsed.response;
  await prisma.habitSegment.update({ where: { id: params.id }, data: { name: parsed.data.name } });
  return NextResponse.json({ ok: true });
});

/** Remove a segment and its habits + marks (cascade). */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await requireOwnSegment(person.id, params.id);
  await prisma.habitSegment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
