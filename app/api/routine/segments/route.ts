import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, segmentCreateSchema } from "@/lib/validation";
import { appendOrderKey, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a habit segment to the manager's own person's grid. */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, segmentCreateSchema);
  if (!parsed.ok) return parsed.response;

  const siblings = await prisma.habitSegment.findMany({ where: { personId: person.id }, select: { orderKey: true } });
  const segment = await prisma.habitSegment.create({
    data: { personId: person.id, name: parsed.data.name, orderKey: appendOrderKey(siblings.map((s) => s.orderKey)) },
    select: { id: true, name: true, orderKey: true },
  });
  return NextResponse.json(segment, { status: 201 });
});
