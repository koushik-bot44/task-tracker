import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notifyAddedToProject } from "@/lib/notify";
import { assertManager } from "@/lib/permissions";
import { canSeeProject } from "@/lib/project-visibility";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const bodySchema = z.object({ userId: z.string().min(1) });

/** Any manager who can SEE the project — owner or collaborator — manages its
    developer members (phase 14). A manager who can't see it gets 404. */
async function requireProjectManager(projectId: string) {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can manage members");
  if (!(await canSeeProject(actor, projectId))) {
    throw new HttpError(404, "Project not found");
  }
  return actor;
}

/**
 * The project's explicit developer members, plus how many tasks each developer
 * is assigned in this project. The counts let the panel warn — before it acts —
 * that removing someone still leaves them seeing the tool through their work.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  await requireProjectManager(params.id);

  const [members, assigned] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: params.id },
      select: { userId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: { projectId: params.id, deletedAt: null, assigneeId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const assignedCounts: Record<string, number> = {};
  for (const row of assigned) {
    if (row.assigneeId) assignedCounts[row.assigneeId] = row._count._all;
  }

  return NextResponse.json({
    memberIds: members.map((m) => m.userId),
    assignedCounts,
  });
});

/** Add a developer. Any manager who can see the project. Idempotent. */
export const POST = route(async (req: Request, { params }: Params) => {
  const actor = await requireProjectManager(params.id);
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const [project, user] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.id }, select: { id: true, name: true, slug: true } }),
    prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { role: true, disabledAt: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!user || user.disabledAt) {
    throw new HttpError(400, "That user can't be added.");
  }
  // Membership is for developers; leads see every project; managers see the ones they own or collaborate on.
  if (user.role !== "RESOURCE") {
    throw new HttpError(400, "Only developers are added as members — leads and managers already see every project.");
  }

  // Notify only on a GENUINE add (phase 29) — a re-add of an existing member is
  // idempotent and must not re-email/re-bell.
  const already = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: parsed.data.userId } },
    select: { projectId: true },
  });
  if (!already) {
    await prisma.projectMember.create({ data: { projectId: params.id, userId: parsed.data.userId } });
    await notifyAddedToProject({
      userId: parsed.data.userId,
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      role: "member",
      addedById: actor.id,
      addedByName: actor.name,
    });
  }
  return NextResponse.json({ ok: true });
});

/**
 * Remove a developer's explicit membership. Any manager who can see the project. Their task
 * assignments are KEPT (the safe choice — never silently erase someone's work);
 * a developer who still has assigned tasks therefore keeps seeing the project
 * through those tasks until they're reassigned. The UI warns about this.
 */
export const DELETE = route(async (req: Request, { params }: Params) => {
  await requireProjectManager(params.id);
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  await prisma.projectMember.deleteMany({
    where: { projectId: params.id, userId: parsed.data.userId },
  });
  const assignedCount = await prisma.task.count({
    where: { projectId: params.id, assigneeId: parsed.data.userId, deletedAt: null },
  });
  return NextResponse.json({ ok: true, stillAssignedTasks: assignedCount });
});
