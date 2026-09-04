import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PROJECT_LEAD_SELECT, serializeProject } from "@/lib/serialize";
import { canActAsProjectOwner, canSeeProject } from "@/lib/project-visibility";
import { HttpError, requireUser, route } from "@/lib/session";
import { isExecutiveRole } from "@/lib/roles";
import { enrichProjects } from "@/lib/projects";
import { badRequest, parseBody, updateProjectSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** One project, enriched (faces, next milestone, behind). Anyone who can see it. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { ...PROJECT_LEAD_SELECT, _count: { select: { tasks: { where: { deletedAt: null, archived: false } } } } },
  });
  if (!project || !(await canSeeProject(user, params.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const [rich] = await enrichProjects([project]);
  return NextResponse.json(serializeProject(rich, project._count.tasks));
});

/**
 * Editing a project — name, lead, dates, status, department — is an OWNER
 * power: the literal owner, a member who may manage, the FOUNDER/DIRECTOR
 * anywhere, or the HOD of its department. `progress` is FOUNDER/DIRECTOR only,
 * set by hand, never computed.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();

  const existing = await prisma.project.findUnique({ where: { id: params.id }, select: { ownerId: true, leadId: true } });
  if (!existing || !(await canSeeProject(actor, params.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const parsed = await parseBody(req, updateProjectSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  const onlyProgress = Object.keys(patch).every((k) => k === "progress");
  if (patch.progress !== undefined && !isExecutiveRole(actor.role)) {
    throw new HttpError(403, "Only the founder or a director sets how far along a project is.");
  }
  if (!onlyProgress && !(await canActAsProjectOwner(actor, params.id))) {
    throw new HttpError(403, "Only the people running this project can change it");
  }

  if (patch.leadId) {
    const lead = await prisma.user.findUnique({ where: { id: patch.leadId }, select: { role: true, disabledAt: true, status: true } });
    if (!lead || lead.disabledAt || lead.status !== "ACTIVE" || lead.role === "PERSON" || lead.role === "ADMIN") {
      return badRequest([{ path: ["leadId"], message: "Pick an active person" }]);
    }
  }

  if (patch.departmentId !== undefined) {
    if (patch.departmentId === null) {
      return badRequest([{ path: ["departmentId"], message: "A project must stay in a department" }]);
    }
    const department = await prisma.department.findUnique({ where: { id: patch.departmentId }, select: { id: true, hodId: true } });
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }
    if (actor.role === "HOD" && department.hodId !== actor.id) {
      throw new HttpError(403, "A department head can only move projects into their own department.");
    }
  }

  const data: Prisma.ProjectUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.color !== undefined) data.color = patch.color;
  if (patch.icon !== undefined) data.icon = patch.icon;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.orderKey !== undefined) data.orderKey = patch.orderKey;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.leadId !== undefined) data.lead = patch.leadId ? { connect: { id: patch.leadId } } : { disconnect: true };
  if (patch.departmentId) data.department = { connect: { id: patch.departmentId } };
  if (patch.startDate !== undefined) data.startDate = patch.startDate ? new Date(patch.startDate) : null;
  if (patch.deadline !== undefined) data.deadline = patch.deadline ? new Date(patch.deadline) : null;
  if (patch.progress !== undefined) data.progress = patch.progress;
  if (patch.priority !== undefined) data.priority = patch.priority;

  const project = await prisma.project.update({
    where: { id: params.id },
    data,
    include: { ...PROJECT_LEAD_SELECT, _count: { select: { tasks: { where: { deletedAt: null, archived: false } } } } },
  });
  const [rich] = await enrichProjects([project]);
  return NextResponse.json(serializeProject(rich, project._count.tasks));
});

/** Hard delete; everything beneath it cascades. An OWNER power. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  const existing = await prisma.project.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!existing || !(await canSeeProject(actor, params.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!(await canActAsProjectOwner(actor, params.id))) {
    throw new HttpError(403, "Only the people running this project can delete it");
  }
  await prisma.project.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
