import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyAddedToProject } from "@/lib/notify";
import { PROJECT_LEAD_SELECT, serializeProject } from "@/lib/serialize";
import { assertManager } from "@/lib/permissions";
import { canActAsProjectOwner, canSeeProject } from "@/lib/project-visibility";
import { HttpError, requireUser, route } from "@/lib/session";
import { badRequest, parseBody, updateProjectSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Editing a tool's metadata — name, colour, description, lead, department,
 * gates, priority, deadline — is an OWNER-power act (phase 14, widened by
 * phase 48): the literal owner, the FOUNDER/DIRECTOR anywhere, or the HOD of
 * the department it is filed in. A collaborating manager can work inside the
 * project but not re-shape it; a manager who neither owns nor collaborates
 * can't see it at all (404, no disclosure).
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can edit a project");

  const existing = await prisma.project.findUnique({
    where: { id: params.id },
    select: { ownerId: true, leadId: true },
  });
  if (!existing || !(await canSeeProject(actor, params.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!(await canActAsProjectOwner(actor, params.id))) {
    throw new HttpError(403, "Only the project's owner can edit it");
  }

  const parsed = await parseBody(req, updateProjectSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  // Same guard as creation: a lead who is not a lead, or who is disabled, is
  // not a lead. Clearing it back to null stays allowed.
  if (patch.leadId) {
    const lead = await prisma.user.findUnique({
      where: { id: patch.leadId },
      select: { role: true, disabledAt: true },
    });
    if (!lead || lead.disabledAt || lead.role !== "TEAM_LEAD") {
      return badRequest([{ path: ["leadId"], message: "Must be an active team lead" }]);
    }
  }

  // Moving between departments (phase 16; company-wide since phase 48): the
  // target department must exist, an HOD may only move a project INTO a
  // department they head, and a project can never be un-filed — every project
  // lives in exactly one department, so null is rejected.
  if (patch.departmentId !== undefined) {
    if (patch.departmentId === null) {
      return badRequest([{ path: ["departmentId"], message: "A project must stay in a department" }]);
    }
    const department = await prisma.department.findUnique({
      where: { id: patch.departmentId },
      select: { id: true, hodId: true },
    });
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
  if (patch.health !== undefined) data.health = patch.health;
  if (patch.gateTemplate !== undefined) data.gateTemplate = patch.gateTemplate;
  if (patch.orderKey !== undefined) data.orderKey = patch.orderKey;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.leadId !== undefined) {
    data.lead = patch.leadId ? { connect: { id: patch.leadId } } : { disconnect: true };
  }
  if (patch.departmentId !== undefined) {
    data.department = patch.departmentId ? { connect: { id: patch.departmentId } } : { disconnect: true };
  }
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.deadline !== undefined) data.deadline = patch.deadline ? new Date(patch.deadline) : null;

  try {
    const project = await prisma.project.update({
      where: { id: params.id },
      data,
      include: {
        ...PROJECT_LEAD_SELECT,
        _count: { select: { tasks: { where: { deletedAt: null } } } },
      },
    });
    // Phase 29: a NEW lead was just assigned — tell them they lead this project.
    if (patch.leadId && patch.leadId !== existing.leadId) {
      await notifyAddedToProject({
        userId: patch.leadId,
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        role: "lead",
        addedById: actor.id,
        addedByName: actor.name,
      });
    }
    return NextResponse.json(serializeProject(project, project._count.tasks));
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
});

/**
 * Projects have no `deletedAt` column, so this is a hard delete and everything
 * beneath it cascades away. Irreversible, and therefore an OWNER power (phase
 * 14, widened by phase 48 to the founder/director and the department's HOD) —
 * a collaborating manager cannot delete someone else's tool.
 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can delete a project");

  const existing = await prisma.project.findUnique({
    where: { id: params.id },
    select: { ownerId: true },
  });
  if (!existing || !(await canSeeProject(actor, params.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!(await canActAsProjectOwner(actor, params.id))) {
    throw new HttpError(403, "Only the project's owner can delete it");
  }

  await prisma.project.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
