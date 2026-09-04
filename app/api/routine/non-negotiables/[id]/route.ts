import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { nonNegotiableUpdateSchema, parseBody } from "@/lib/validation";
import { requireOwnNonNegotiable, personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Rename a non-negotiable / toggle active (own person only). */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await requireOwnNonNegotiable(person.id, params.id);

  const parsed = await parseBody(req, nonNegotiableUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { name, active } = parsed.data;
  await prisma.nonNegotiable.update({
    where: { id: params.id },
    data: { ...(name !== undefined ? { name } : {}), ...(active !== undefined ? { active } : {}) },
  });
  return NextResponse.json({ ok: true });
});

/** Remove a non-negotiable and its marks (cascade). */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await requireOwnNonNegotiable(person.id, params.id);
  await prisma.nonNegotiable.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
