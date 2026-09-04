import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, routineCollaboratorUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Change a monitoring manager's permission (READ_ONLY <-> EDITABLE). Owner only —
    the collaborator row must belong to a routine the caller owns (Person.managerId),
    else 404. */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const found = await prisma.routineCollaborator.findFirst({ where: { id: params.id, person: { managerId: actor.id } }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const parsed = await parseBody(req, routineCollaboratorUpdateSchema);
  if (!parsed.ok) return parsed.response;
  await prisma.routineCollaborator.update({ where: { id: params.id }, data: { permission: parsed.data.permission } });
  return NextResponse.json({ ok: true });
});

/** Revoke a monitoring manager (pending or accepted). Owner only. */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const found = await prisma.routineCollaborator.findFirst({ where: { id: params.id, person: { managerId: actor.id } }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await prisma.routineCollaborator.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
