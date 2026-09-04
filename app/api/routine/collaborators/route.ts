import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { parseBody, routineInviteSchema } from "@/lib/validation";
import { notifyUsers } from "@/lib/notify";
import { personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 39 — the OWNER invites another MANAGER to monitor this routine (READ_ONLY
 * or EDITABLE), mirroring the per-project manager collaboration. Creates a PENDING
 * RoutineCollaborator + a bell/push notification for the invited manager. Owner-only.
 */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });

  const parsed = await parseBody(req, routineInviteSchema);
  if (!parsed.ok) return parsed.response;
  const { managerId, permission } = parsed.data;

  if (managerId === actor.id) {
    return NextResponse.json({ error: "You already own this Well Being." }, { status: 400 });
  }
  const invitee = await prisma.user.findUnique({ where: { id: managerId }, select: { id: true, name: true, role: true, status: true, disabledAt: true } });
  if (!invitee || invitee.role !== "MANAGER" || invitee.status !== "ACTIVE" || invitee.disabledAt) {
    return NextResponse.json({ error: "Pick an active manager." }, { status: 400 });
  }
  const existing = await prisma.routineCollaborator.findUnique({
    where: { personId_managerId: { personId: person.id, managerId } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "That manager is already invited." }, { status: 409 });
  }

  const collab = await prisma.routineCollaborator.create({
    data: { personId: person.id, managerId, permission, invitedById: actor.id, status: "PENDING" },
    select: { id: true },
  });

  await notifyUsers([managerId], {
    type: "routine.invited",
    title: `${actor.name} invited you to monitor a Well Being`,
    body: `${person.name}'s Well Being`,
    url: "/",
    tag: `routine-collab-${collab.id}`,
  });

  return NextResponse.json({ id: collab.id }, { status: 201 });
});
