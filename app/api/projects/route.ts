import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { DEFAULT_GATE_TEMPLATE } from "@/lib/gates";
import { issueInvite } from "@/lib/invite";
import { notifyAddedToProject } from "@/lib/notify";
import { PROJECT_LEAD_SELECT, serializeProject } from "@/lib/serialize";
import { assertManager } from "@/lib/permissions";
import { requireUser, route } from "@/lib/session";
import { visibleProjectIds } from "@/lib/project-visibility";
import { badRequest, createProjectSchema, parseBody } from "@/lib/validation";
import { PROJECT_COLORS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "tool";
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  const existing = await prisma.project.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((p) => p.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export const GET = route(async () => {
  const user = await requireUser();
  const visible = await visibleProjectIds(user);

  const projects = await prisma.project.findMany({
    where: visible ? { id: { in: [...visible] } } : undefined,
    orderBy: { orderKey: "asc" },
    include: {
      ...PROJECT_LEAD_SELECT,
      _count: { select: { tasks: { where: { deletedAt: null } } } },
    },
  });

  return NextResponse.json(
    projects.map((p) => serializeProject(p, p._count.tasks)),
  );
});

/**
 * Project authority only (the phase-48 chain). Creating a tool means committing
 * to what it is for and who owns it — a decision above a team member's pay
 * grade and beside a lead's. Where each role may create:
 *   FOUNDER/DIRECTOR → any department.
 *   HOD              → only the department(s) they head.
 *   MANAGER          → any department (departments are company structure now;
 *                      the project still becomes THEIRS via ownerId).
 */
export const POST = route(async (req: Request) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can create a project");

  const parsed = await parseBody(req, createProjectSchema);
  if (!parsed.ok) return parsed.response;
  const { name, color, icon, health, gateTemplate, description, leadId, developerIds, inviteNew, departmentId, priority, deadline } = parsed.data;

  // Every project lives in exactly one department (phase 16). Departments are
  // company-wide now: the department must exist, and an HOD may only file into
  // a department they actually head.
  if (!departmentId) {
    return badRequest([{ path: ["departmentId"], message: "A department is required" }]);
  }
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, hodId: true },
  });
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }
  if (actor.role === "HOD" && department.hodId !== actor.id) {
    return NextResponse.json(
      { error: "A department head can only create projects in their own department." },
      { status: 403 },
    );
  }

  // The lead is optional (phase 31) — a project can start without one. When one
  // IS named it must exist, be active, and actually be a lead: accepting an
  // arbitrary id would let a manager park a tool on a developer or a disabled
  // account and only find out much later.
  if (leadId) {
    const lead = await prisma.user.findUnique({
      where: { id: leadId },
      select: { id: true, role: true, disabledAt: true },
    });
    if (!lead || lead.disabledAt || lead.role !== "TEAM_LEAD") {
      return badRequest([
        { path: ["leadId"], message: "Must be an active team lead" },
      ]);
    }
  }

  const last = await prisma.project.findFirst({
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });

  const count = await prisma.project.count();

  const project = await prisma.project.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      color: color ?? PROJECT_COLORS[count % PROJECT_COLORS.length],
      icon: icon ?? null,
      health: health ?? "ACTIVE",
      gateTemplate: gateTemplate ?? DEFAULT_GATE_TEMPLATE,
      orderKey: generateKeyBetween(last?.orderKey ?? null, null),
      description,
      leadId: leadId ?? null,
      departmentId: departmentId ?? null,
      priority: priority ?? "MEDIUM",
      deadline: deadline ? new Date(deadline) : null,
      // The creating manager owns it (phase 14) — the silo starts here.
      ownerId: actor.id,
    },
    include: PROJECT_LEAD_SELECT,
  });

  // Initial team-member members (phase 11): only actual, active team members.
  if (developerIds && developerIds.length > 0) {
    const devs = await prisma.user.findMany({
      where: { id: { in: developerIds }, role: "RESOURCE", disabledAt: null },
      select: { id: true },
    });
    if (devs.length > 0) {
      await prisma.projectMember.createMany({
        data: devs.map((d) => ({ projectId: project.id, userId: d.id })),
        skipDuplicates: true,
      });
    }
  }

  // Phase 29: invite brand-new people straight into the project. Sequential and
  // per-entry guarded so one bad row can't half-create or fail the whole project.
  // An EXISTING developer is just added + emailed "added to project"; a NEW email
  // becomes a PENDING developer via the existing invite flow (one invite email
  // that ALSO names the project — no second "added" email) and is added as a
  // member. Manager-only (already asserted above).
  // If the manager didn't pick a lead but invites a brand-new TEAM_LEAD, the first
  // such invitee becomes THIS project's lead (they lead it once they activate).
  let newProjectLeadId: string | null = null;
  if (inviteNew && inviteNew.length > 0) {
    for (const entry of inviteNew) {
      const email = entry.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
      // The chosen role only applies to a BRAND-NEW account; an existing email
      // keeps whatever role it already has. Default to RESOURCE (team member).
      const inviteRole = entry.role === "TEAM_LEAD" ? "TEAM_LEAD" : "RESOURCE";
      try {
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, disabledAt: true },
        });
        if (existing) {
          // Only team members become members; a lead/manager already sees projects.
          if (existing.role === "RESOURCE" && !existing.disabledAt) {
            await prisma.projectMember.upsert({
              where: { projectId_userId: { projectId: project.id, userId: existing.id } },
              update: {},
              create: { projectId: project.id, userId: existing.id },
            });
            await notifyAddedToProject({
              userId: existing.id, projectId: project.id, projectName: project.name,
              projectSlug: project.slug, role: "member", addedById: actor.id, addedByName: actor.name,
            });
          }
          continue;
        }
        // Brand-new account at the chosen role. A RESOURCE is added to this project
        // as a member. A TEAM_LEAD, when the project has no lead yet, is assigned as
        // this project's lead (the first one wins); a later lead is just created.
        const isDev = inviteRole === "RESOURCE";
        const willLeadThisProject = !isDev && !leadId && !newProjectLeadId;
        const invited = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: { email, name: entry.name.trim(), role: inviteRole, status: "PENDING", passwordHash: null },
          });
          if (isDev) await tx.projectMember.create({ data: { projectId: project.id, userId: u.id } });
          return u;
        });
        if (willLeadThisProject) newProjectLeadId = invited.id;
        // The invite email names the project when the person is actually linked to
        // it — a developer member, or the new lead — but not for an extra lead.
        await issueInvite({
          user: { id: invited.id, name: invited.name, email: invited.email, role: invited.role },
          inviterName: actor.name,
          createdById: actor.id,
          projectName: isDev || willLeadThisProject ? project.name : undefined,
        });
      } catch (err) {
        console.error(`[projects] invite-new failed for ${email}:`, (err as Error).message);
      }
    }
  }

  // Stamp the newly-invited lead onto the project (outside the per-entry txns).
  if (newProjectLeadId) {
    const withLead = await prisma.project.update({
      where: { id: project.id },
      data: { leadId: newProjectLeadId },
      include: PROJECT_LEAD_SELECT,
    });
    return NextResponse.json(serializeProject(withLead, 0), { status: 201 });
  }

  return NextResponse.json(serializeProject(project, 0), { status: 201 });
});
