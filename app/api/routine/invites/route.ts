import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import type { RoutineInviteDTO, RoutinePermission } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's own PENDING routine invites, for the Home accept/decline panel —
    mirrors GET /api/collaboration-invites. */
export const GET = route(async () => {
  const actor = await requireManager();
  const rows = await prisma.routineCollaborator.findMany({
    where: { managerId: actor.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, permission: true, createdAt: true, person: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });
  const invites: RoutineInviteDTO[] = rows.map((r) => ({
    id: r.id,
    personName: r.person.name,
    ownerName: r.invitedBy.name,
    permission: r.permission as RoutinePermission,
    invitedAt: r.createdAt.toISOString(),
  }));
  return NextResponse.json(invites);
});
