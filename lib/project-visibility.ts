import type { Role } from "@prisma/client";
import { isAdmin } from "@/lib/permissions";
import { isExecutiveRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";

/**
 * Which projects a user may see — the single source of truth.
 *
 *   ADMIN      → NONE (403). PERSON → NONE (403) — the two walls.
 *   FOUNDER / DIRECTOR → all (null): only the CEO sees the whole company.
 *   Everyone else (HOD, MANAGER, TEAM_LEAD, RESOURCE) → their own department
 *   — every project filed there — plus any department they head, plus the
 *   projects they own, lead, belong to or hold a task in anywhere else.
 *   (Owner, 2026-09-04: "if I'm a department head I only see my department;
 *   someone invited into a department sees that department only.")
 *
 * Returns null when the user sees everything, or a Set of project ids.
 */
export async function visibleProjectIds(user: { id: string; role: Role }): Promise<Set<string> | null> {
  if (user.role === "PERSON") {
    throw new HttpError(403, "Not available for this account.");
  }
  if (isAdmin(user)) {
    throw new HttpError(403, "Admins don't have project access");
  }
  if (isExecutiveRole(user.role)) return null;

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { departmentId: true } });
  const departmentWhere: { departmentId?: string; department?: { hodId: string } }[] = [];
  if (me?.departmentId) departmentWhere.push({ departmentId: me.departmentId });
  if (user.role === "HOD") departmentWhere.push({ department: { hodId: user.id } });

  const [inDepartment, owned, led, members, assigned] = await Promise.all([
    departmentWhere.length ? prisma.project.findMany({ where: { OR: departmentWhere }, select: { id: true } }) : Promise.resolve([]),
    prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true } }),
    prisma.project.findMany({ where: { leadId: user.id }, select: { id: true } }),
    prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } }),
    prisma.task.findMany({
      where: { assigneeId: user.id, deletedAt: null, isPrivate: false },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
  ]);
  const ids = new Set<string>();
  for (const p of inDepartment) ids.add(p.id);
  for (const p of owned) ids.add(p.id);
  for (const p of led) ids.add(p.id);
  for (const m of members) ids.add(m.projectId);
  for (const t of assigned) if (t.projectId) ids.add(t.projectId);
  return ids;
}

/** True if the user may see this specific project. Throws 403 for an admin. */
export async function canSeeProject(user: { id: string; role: Role }, projectId: string): Promise<boolean> {
  const visible = await visibleProjectIds(user);
  return visible === null || visible.has(projectId);
}

/**
 * May this user read/write this specific task? A PRIVATE task is caller-scoped
 * — only its owner, with NO override. A project task follows project visibility.
 */
export async function canAccessTask(
  user: { id: string; role: Role },
  task: { isPrivate: boolean; ownerId: string | null; projectId: string | null },
): Promise<boolean> {
  if (task.isPrivate) return task.ownerId === user.id;
  if (task.projectId === null) return false;
  return canSeeProject(user, task.projectId);
}

/** The owner of a project (or null). */
export async function projectOwnerId(projectId: string): Promise<string | null> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  return p?.ownerId ?? null;
}

/**
 * May this user exercise OWNER powers on this project (edit its name, lead,
 * dates, status; delete it; re-file it)? FOUNDER/DIRECTOR anywhere; the HOD
 * of its department; the literal owner; a member who may manage.
 */
export async function canActAsProjectOwner(user: { id: string; role: Role }, projectId: string): Promise<boolean> {
  if (isExecutiveRole(user.role)) return true;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, department: { select: { hodId: true } }, members: { where: { userId: user.id }, select: { canManage: true } } },
  });
  if (!p) return false;
  if (p.ownerId === user.id) return true;
  if (user.role === "HOD" && p.department?.hodId === user.id) return true;
  return p.members.some((m) => m.canManage);
}
