import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** The caller's own PENDING invite for this collaborator row, or null. */
async function pendingInvite(callerId: string, id: string) {
  return prisma.routineCollaborator.findFirst({ where: { id, managerId: callerId, status: "PENDING" }, select: { id: true } });
}

/** Accept a routine invite -> ACCEPTED; the caller can now open the routine. */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const invite = await pendingInvite(actor.id, params.id);
  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  await prisma.routineCollaborator.update({ where: { id: params.id }, data: { status: "ACCEPTED" } });
  return NextResponse.json({ ok: true });
});

/** Decline a routine invite -> the row is deleted (mirrors project-collab decline). */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireManager();
  const invite = await pendingInvite(actor.id, params.id);
  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  await prisma.routineCollaborator.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
