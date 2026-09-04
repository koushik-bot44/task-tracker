import type { Role } from "@prisma/client";
import { isAdmin } from "@/lib/permissions";
import { isExecutiveRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";

/**
 * Which projects a user may see — the single source of truth.
 *
 * Phase 14 built the walls; phase 48 added the chain above them:
 *   ADMIN      → NONE. An admin has no project access; asking throws 403, so
 *               every project-scoped read/write refuses an admin in one place.
 *   PERSON     → NONE (403) — the Well Being wall.
 *   FOUNDER    → all (null). The top of the chain sees everything.
 *   DIRECTOR   → all (null). Company-wide like the founder.
 *   HOD        → the projects filed in the department(s) they head, plus
 *               anything they own or collaborate on (an HOD can still be a
 *               working manager on the side).
 *   TEAM_LEAD  → all (null). Leads run delivery across tools; not siloed.
 *   MANAGER    → SILOED to the tools they OWN or have ACCEPTED a collaboration
 *               invite on. A manager does not see every project.
 *   RESOURCE   → tools they are an explicit member of OR assigned a task in.
 *
 * Returns null when the user sees everything, or a Set of project ids when the
 * view is restricted. Throws for an admin (they see nothing here).
 */
export async function visibleProjectIds(user: { id: string; role: Role }): Promise<Set<string> | null> {
  // Phase 35: a PERSON has NO work access at all. requireUser already 403s a PERSON
  // before any handler runs; this mirrors the admin wall so a PERSON can never fall
  // through the RESOURCE branch into an "empty but reachable" work view.
  if (user.role === "PERSON") {
    throw new HttpError(403, "Not available for this account.");
  }
  if (isAdmin(user)) {
    throw new HttpError(403, "Admins don't have project access");
  }
  if (isExecutiveRole(user.role)) return null;
  if (user.role === "TEAM_LEAD") return null;

  if (user.role === "HOD") {
    const [headed, owned, collab] = await Promise.all([
      prisma.project.findMany({
        where: { department: { hodId: user.id } },
        select: { id: true },
      }),
      prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true } }),
      prisma.projectManager.findMany({
        where: { userId: user.id, status: "ACCEPTED" },
        select: { projectId: true },
      }),
    ]);
    const ids = new Set<string>();
    for (const p of headed) ids.add(p.id);
    for (const p of owned) ids.add(p.id);
    for (const c of collab) ids.add(c.projectId);
    return ids;
  }

  if (user.role === "MANAGER") {
    const [owned, collab] = await Promise.all([
      prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true } }),
      prisma.projectManager.findMany({
        where: { userId: user.id, status: "ACCEPTED" },
        select: { projectId: true },
      }),
    ]);
    const ids = new Set<string>();
    for (const p of owned) ids.add(p.id);
    for (const c of collab) ids.add(c.projectId);
    return ids;
  }

  // RESOURCE (was DEVELOPER)
  const [members, assigned] = await Promise.all([
    prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } }),
    prisma.task.findMany({
      // isPrivate:false so a private personal task (phase 15, null projectId)
      // can never add a null into the visible-project set.
      where: { assigneeId: user.id, deletedAt: null, isPrivate: false },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
  ]);
  const ids = new Set<string>();
  for (const m of members) ids.add(m.projectId);
  // projectId is nullable since phase 15; the isPrivate:false filter above means
  // it is never null here, but narrow it so the Set<string> stays honest.
  for (const t of assigned) if (t.projectId) ids.add(t.projectId);
  return ids;
}

/** True if the user may see this specific project. Throws 403 for an admin. */
export async function canSeeProject(user: { id: string; role: Role }, projectId: string): Promise<boolean> {
  const visible = await visibleProjectIds(user);
  return visible === null || visible.has(projectId);
}

/**
 * May this user read/write this specific task? Phase 15: a PRIVATE task is
 * caller-scoped — only its owner, with NO lead/manager/admin override — so it is
 * decided by ownerId alone and never routed through project visibility (whose
 * null-projectId branch would otherwise wrongly admit a lead, and which throws
 * for an admin). A normal project task keeps the existing visibility rule.
 */
export async function canAccessTask(
  user: { id: string; role: Role },
  task: { isPrivate: boolean; ownerId: string | null; projectId: string | null },
): Promise<boolean> {
  if (task.isPrivate) return task.ownerId === user.id;
  if (task.projectId === null) return false;
  return canSeeProject(user, task.projectId);
}

/** The owner of a project (or null). Used for owner-only power checks. */
export async function projectOwnerId(projectId: string): Promise<string | null> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  return p?.ownerId ?? null;
}

/**
 * Phase 48: may this user exercise OWNER powers on this project (edit metadata,
 * delete, re-file, manage collaborators, set priority/deadline)?
 *   FOUNDER/DIRECTOR → yes, anywhere.
 *   HOD             → yes, for projects filed in a department they head.
 *   anyone          → yes, for projects they literally own.
 * This widens the phase-14 owner-only checks WITHOUT weakening them for plain
 * managers — a collaborator manager still cannot reshape a project.
 */
export async function canActAsProjectOwner(
  user: { id: string; role: Role },
  projectId: string,
): Promise<boolean> {
  if (isExecutiveRole(user.role)) return true;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, department: { select: { hodId: true } } },
  });
  if (!p) return false;
  if (p.ownerId === user.id) return true;
  if (user.role === "HOD" && p.department?.hodId === user.id) return true;
  return false;
}
