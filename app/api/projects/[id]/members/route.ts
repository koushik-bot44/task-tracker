import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueInvite } from "@/lib/invite";
import { canSeeProject } from "@/lib/project-visibility";
import { canManageProject, ensureMember, projectPeople } from "@/lib/project-people";
import { syncProjectReviews } from "@/lib/meetings";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const bodySchema = z.object({
  userId: z.string().min(1).optional(),
  canManage: z.boolean().optional(),
  /** "Add people" can invite someone brand-new by email; they join as a member. */
  invite: z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.string().trim().min(3).max(320),
      role: z.enum(["RESOURCE", "TEAM_LEAD"]).optional(),
    })
    .optional(),
});

/** Everyone on the project (lead, owner, members, task holders). Anyone who can see it. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  if (!(await canSeeProject(user, params.id))) {
    throw new HttpError(404, "Project not found");
  }
  return NextResponse.json(await projectPeople(params.id));
});

/** "Add people" — MANAGER+ who runs the project. Idempotent for an existing person. */
export const POST = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!(await canSeeProject(actor, params.id))) throw new HttpError(404, "Project not found");
  if (!(await canManageProject(actor, params.id))) throw new HttpError(403, "Only the people running this project can add people.");

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!project) throw new HttpError(404, "Project not found");

  if (parsed.data.invite) {
    const { name, role } = parsed.data.invite;
    const email = parsed.data.invite.email.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "That email does not look right.");
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, disabledAt: true } });
    if (existing) {
      if (existing.disabledAt || existing.role === "PERSON" || existing.role === "ADMIN") {
        throw new HttpError(400, "That person can't be added.");
      }
      await ensureMember(project.id, existing.id);
      return NextResponse.json({ ok: true, emailSent: false, userId: existing.id });
    }
    const invited = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, name, role: role === "TEAM_LEAD" ? "TEAM_LEAD" : "RESOURCE", status: "PENDING", passwordHash: null },
      });
      await tx.projectMember.create({ data: { projectId: project.id, userId: u.id } });
      return u;
    });
    const { sent } = await issueInvite({
      user: { id: invited.id, name: invited.name, email: invited.email, role: invited.role },
      inviterName: actor.name,
      createdById: actor.id,
      projectName: project.name,
    });
    return NextResponse.json({ ok: true, emailSent: sent, userId: invited.id }, { status: 201 });
  }

  if (!parsed.data.userId) throw new HttpError(400, "Pick someone to add.");
  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { role: true, disabledAt: true, status: true } });
  if (!user || user.disabledAt || user.role === "PERSON" || user.role === "ADMIN") {
    throw new HttpError(400, "That person can't be added.");
  }
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: params.id, userId: parsed.data.userId } },
    update: parsed.data.canManage !== undefined ? { canManage: parsed.data.canManage } : {},
    create: { projectId: params.id, userId: parsed.data.userId, canManage: parsed.data.canManage ?? false },
  });
  syncProjectReviews(params.id, actor.id).catch(() => undefined);
  return NextResponse.json({ ok: true });
});

/** Remove someone's membership. Their tasks are KEPT (never silently erase work). */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  if (!(await canSeeProject(actor, params.id))) throw new HttpError(404, "Project not found");
  if (!(await canManageProject(actor, params.id))) throw new HttpError(403, "Only the people running this project can remove people.");
  const parsed = await parseBody(req, z.object({ userId: z.string().min(1) }));
  if (!parsed.ok) return parsed.response;

  await prisma.projectMember.deleteMany({ where: { projectId: params.id, userId: parsed.data.userId } });
  const assignedCount = await prisma.task.count({ where: { projectId: params.id, assigneeId: parsed.data.userId, deletedAt: null } });
  syncProjectReviews(params.id, actor.id).catch(() => undefined);
  return NextResponse.json({ ok: true, stillAssignedTasks: assignedCount });
});
