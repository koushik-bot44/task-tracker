import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueInvite } from "@/lib/invite";
import { canSeeProject } from "@/lib/project-visibility";
import { invitePeopleToProject } from "@/lib/project-invites";
import { canManageProject, ensureMember, projectPeople } from "@/lib/project-people";
import { assertCanCreateUserWithRole } from "@/lib/permissions";
import { syncProjectReviews } from "@/lib/meetings";
import { HttpError, requireUser, route } from "@/lib/session";
import { addOtherEmails, dedupeEmails, isEmailShaped, findUserIdByEmail } from "@/lib/user-emails";
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
      /** The same person's other addresses; any of them signs them in. */
      emails: z.array(z.string().trim().min(3).max(320)).max(10).optional(),
      role: z.enum(["RESOURCE", "TEAM_LEAD"]).optional(),
    })
    .optional(),
  /** Several people at once (owner, 2026-09-10): each a name, their addresses — the
      first is where the invite goes — and how they join. */
  invites: z
    .array(
      z.object({
        name: z.string().trim().max(80).optional(),
        emails: z.array(z.string().trim().min(3).max(320)).min(1).max(10),
        role: z.enum(["RESOURCE", "TEAM_LEAD"]).optional(),
      }),
    )
    .min(1)
    .max(50)
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
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, name: true, departmentId: true } });
  if (!project) throw new HttpError(404, "Project not found");

  if (parsed.data.invites) {
    const outcome = await invitePeopleToProject(actor, project, parsed.data.invites);
    return NextResponse.json({ ok: true, ...outcome }, { status: outcome.invited > 0 ? 201 : 200 });
  }

  if (parsed.data.invite) {
    const { name, role } = parsed.data.invite;
    // Creating an account here is creating an account: the same rule as People → Invite.
    assertCanCreateUserWithRole(actor, role === "TEAM_LEAD" ? "TEAM_LEAD" : "RESOURCE");
    // One person, several addresses: the first is the main one.
    const addresses = dedupeEmails([parsed.data.invite.email, ...(parsed.data.invite.emails ?? [])]);
    const [email, ...others] = addresses;
    if (!email || addresses.some((e) => !isEmailShaped(e))) throw new HttpError(400, "That email does not look right.");
    // Any of them finds a person already here, so nobody is added twice.
    const found = (await Promise.all(addresses.map(findUserIdByEmail))).find(Boolean);
    if (found) {
      const existing = await prisma.user.findUnique({ where: { id: found }, select: { id: true, role: true, disabledAt: true } });
      if (!existing || existing.disabledAt || existing.role === "PERSON" || existing.role === "ADMIN") {
        throw new HttpError(400, "That person can't be added.");
      }
      await ensureMember(project.id, existing.id);
      await addOtherEmails(existing.id, addresses);
      await syncProjectReviews(project.id, actor.id).catch(() => undefined);
      return NextResponse.json({ ok: true, emailSent: false, userId: existing.id });
    }
    const invited = await prisma.$transaction(async (tx) => {
      // In the project's department, like everyone invited with a new project (2026-09-10).
      const u = await tx.user.create({
        data: { email, name, role: role === "TEAM_LEAD" ? "TEAM_LEAD" : "RESOURCE", status: "PENDING", passwordHash: null, departmentId: project.departmentId },
      });
      await tx.projectMember.create({ data: { projectId: project.id, userId: u.id } });
      return u;
    });
    await addOtherEmails(invited.id, others);
    const { sent } = await issueInvite({
      user: { id: invited.id, name: invited.name, email: invited.email, role: invited.role },
      inviterName: actor.name,
      createdById: actor.id,
      projectName: project.name,
    });
    await syncProjectReviews(project.id, actor.id).catch(() => undefined);
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
  // Awaited: serverless freezes work started after the response (work model).
  await syncProjectReviews(params.id, actor.id).catch(() => undefined);
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
  // Awaited: serverless freezes work started after the response (work model).
  await syncProjectReviews(params.id, actor.id).catch(() => undefined);
  return NextResponse.json({ ok: true, stillAssignedTasks: assignedCount });
});
