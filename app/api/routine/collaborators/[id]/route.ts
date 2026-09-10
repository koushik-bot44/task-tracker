import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnedPersons } from "@/lib/routine";
import { requireManager, route } from "@/lib/session";
import { parseBody, routineCollaboratorUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** The collaborator row, when it sits on a routine the caller runs as owner
    (getOwnedPersons, 2026-09-10), or null. */
async function ownedRow(callerId: string, id: string) {
  const owned = await getOwnedPersons(callerId);
  return prisma.routineCollaborator.findFirst({ where: { id, personId: { in: owned.map((p) => p.id) } }, select: { id: true } });
}

/** Change a monitoring manager's permission (READ_ONLY <-> EDITABLE). Owner only —
    the collaborator row must belong to a routine the caller owns, else 404. */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const found = await ownedRow(actor.id, params.id);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const parsed = await parseBody(req, routineCollaboratorUpdateSchema);
  if (!parsed.ok) return parsed.response;
  await prisma.routineCollaborator.update({ where: { id: params.id }, data: { permission: parsed.data.permission } });
  return NextResponse.json({ ok: true });
});

/** Revoke a monitoring manager (pending or accepted). Owner only. */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const found = await ownedRow(actor.id, params.id);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await prisma.routineCollaborator.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
