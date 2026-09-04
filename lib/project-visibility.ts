import type { Role } from "@prisma/client";
import { isAdmin } from "@/lib/permissions";
import { isExecutiveRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";

/**
 * Which projects a user may see — the single source of truth.
 *
 *   ADMIN      → NONE (403). PERSON → NONE (403) — the two walls.
 *   FOUNDER / DIRECTOR / TEAM_LEAD → all (null).
 *   HOD        → the projects filed in the department(s) they head, plus
 *               anything they own or are a member of.
 *   MANAGER    → the projects they OWN or are a MEMBER of (a member who may
 *               manage is what the old accepted collaboration meant).
 *   RESOURCE   → projects they are a member of OR hold a task in.
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
  if (user.role === "TEAM_LEAD") return null;

  const ids = new Set<string>();
  if (user.role === "HOD") {
    const headed = await prisma.project.findMany({ where: { department: { hodId: user.id } }, select: { id: true } });
    for (const p of headed) ids.add(p.id);
  }
  if (user.role === "HOD" || user.role === "MANAGER") {
    const [owned, member] = await Promise.all([
      prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true } }),
      prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } }),
    ]);
    for (const p of owned) ids.add(p.id);
    for (const m of member) ids.add(m.projectId);
    const led = await prisma.project.findMany({ where: { leadId: user.id }, select: { id: true } });
    for (const p of led) ids.add(p.id);
    return ids;
  }

  // RESOURCE
  const [members, assigned, led] = await Promise.all([
    prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } }),
    prisma.task.findMany({
      where: { assigneeId: user.id, deletedAt: null, isPrivate: false },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
    prisma.project.findMany({ where: { leadId: user.id }, select: { id: true } }),
  ]);
  for (const m of members) ids.add(m.projectId);
  for (const t of assigned) if (t.projectId) ids.add(t.projectId);
  for (const p of led) ids.add(p.id);
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
