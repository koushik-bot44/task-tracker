import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { nonNegotiableCreateSchema, parseBody } from "@/lib/validation";
import { appendOrderKey, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a non-negotiable to the manager's own person. */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });

  const parsed = await parseBody(req, nonNegotiableCreateSchema);
  if (!parsed.ok) return parsed.response;

  const siblings = await prisma.nonNegotiable.findMany({ where: { personId: person.id }, select: { orderKey: true } });
  const nn = await prisma.nonNegotiable.create({
    data: { personId: person.id, name: parsed.data.name, orderKey: appendOrderKey(siblings.map((s) => s.orderKey)) },
    select: { id: true, name: true, orderKey: true, active: true },
  });
  return NextResponse.json({ ...nn, days: {}, requiredThisWeek: 0, doneThisWeek: 0, missedThisWeek: 0 }, { status: 201 });
});
