import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { canActAsProjectOwner, canSeeProject } from "@/lib/project-visibility";
import { notifyUsers } from "@/lib/notify";
import { sendCollabInviteEmail } from "@/lib/collab-invite";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };
const bodySchema = z.object({ userId: z.string().min(1) });

/**
 * A project's collaborating managers (phase 14). Any manager who can SEE the
 * project reads the panel; only the OWNER invites or revokes. The owner is
 * Project.ownerId; collaborators are ProjectManager rows (PENDING or ACCEPTED).
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can see this");
  if (!(await canSeeProject(actor, params.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { ownerId: true, owner: { select: { id: true, name: true } } },
  });
  const rows = await prisma.projectManager.findMany({
    where: { projectId: params.id },
    select: { userId: true, status: true, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    ownerId: project?.ownerId ?? null,
    ownerName: project?.owner?.name ?? null,
    isOwner: project?.ownerId === actor.id,
    collaborators: rows.map((r) => ({ userId: r.userId, name: r.user.name, status: r.status })),
  });
});

/** Owner invites another active manager to collaborate. Idempotent-ish: a
    pending or accepted invite for the same manager is a no-op conflict. */
export const POST = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can invite collaborators");

  if (!(await canActAsProjectOwner(actor, params.id))) {
    // 404 if they can't even see it; 403 if they see it but aren't the owner.
    if (!(await canSeeProject(actor, params.id))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    throw new HttpError(403, "Only the project's owner can invite collaborators");
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { userId } = parsed.data;

  if (userId === actor.id) {
    throw new HttpError(400, "You already own this project.");
  }
  const invitee = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, disabledAt: true, status: true },
  });
  if (!invitee || invitee.disabledAt || invitee.status !== "ACTIVE" || invitee.role !== "MANAGER") {
    throw new HttpError(400, "You can only invite an active manager.");
  }

  const existing = await prisma.projectManager.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (existing) {
    throw new HttpError(409, existing.status === "ACCEPTED" ? "They already collaborate here." : "They already have a pending invite.");
  }

  const pm = await prisma.projectManager.create({
    data: { projectId: params.id, userId, status: "PENDING" },
    select: { id: true },
  });

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { name: true } });
  const projectName = project?.name ?? "a project";

  // In-app (phase 14): bell + push, seen on the invited manager's Home.
  await notifyUsers([userId], {
    type: "collab.invited",
    title: `${actor.name} invited you to collaborate`,
    body: `on ${projectName}`,
    url: "/",
    tag: `collab-${params.id}`,
  });

  // Email (phase 18): a link to accept/decline that stays in sync with the
  // in-app panel via the same ProjectManager row. Fire-and-forget — a dead SMTP
  // (or an undeliverable address) never fails the invite; the in-app path holds.
  await sendCollabInviteEmail({
    invitee: { id: invitee.id, name: invitee.name, email: invitee.email },
    inviterName: actor.name,
    projectName,
    projectManagerId: pm.id,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true }, { status: 201 });
});
