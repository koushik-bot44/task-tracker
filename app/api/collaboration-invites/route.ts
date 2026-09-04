import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A manager's own pending collaboration invites (phase 14) — what they see on
 * Home to accept or decline. Each names the project and who invited them.
 */
export const GET = route(async () => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager has collaboration invites");

  const rows = await prisma.projectManager.findMany({
    where: { userId: actor.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      projectId: true,
      createdAt: true,
      project: { select: { name: true, owner: { select: { name: true } } } },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      projectId: r.projectId,
      projectName: r.project.name,
      ownerName: r.project.owner?.name ?? "A manager",
      invitedAt: r.createdAt.toISOString(),
    })),
  );
});
