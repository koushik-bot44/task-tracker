import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isExecutiveRole } from "@/lib/roles";
import type { ProjectPersonDTO } from "@/lib/types";

/**
 * Who is ON a project, in one place: the lead, the owner, explicit members,
 * and everyone holding a live task in it — active accounts only, lead first.
 * The faces on the project header, the "Who?" row of Give a task, the meeting
 * candidate list and the assignment rule all read this.
 */
export async function projectPeople(projectId: string): Promise<ProjectPersonDTO[]> {
  const [project, members, holders] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        lead: { select: { id: true, name: true, role: true, disabledAt: true, status: true } },
        owner: { select: { id: true, name: true, role: true, disabledAt: true, status: true } },
      },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { canManage: true, user: { select: { id: true, name: true, role: true, disabledAt: true, status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: { projectId, deletedAt: null, archived: false, assigneeId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const taskCount = new Map<string, number>();
  for (const h of holders) if (h.assigneeId) taskCount.set(h.assigneeId, h._count._all);

  const out = new Map<string, ProjectPersonDTO>();
  const add = (
    u: { id: string; name: string; role: Role; disabledAt: Date | null; status: string } | null | undefined,
    flags: Partial<Pick<ProjectPersonDTO, "isLead" | "isOwner" | "isMember" | "canManage">>,
  ) => {
    if (!u || u.disabledAt || u.status !== "ACTIVE" || u.role === "PERSON" || u.role === "ADMIN") return;
    const prev = out.get(u.id) ?? {
      id: u.id,
      name: u.name,
      role: u.role,
      isLead: false,
      isOwner: false,
      isMember: false,
      canManage: false,
      taskCount: taskCount.get(u.id) ?? 0,
    };
    out.set(u.id, { ...prev, ...flags });
  };
  add(project?.lead, { isLead: true });
  add(project?.owner, { isOwner: true });
  for (const m of members) add(m.user, { isMember: true, canManage: m.canManage });

  const holderIds = [...taskCount.keys()].filter((id) => !out.has(id));
  if (holderIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: holderIds } },
      select: { id: true, name: true, role: true, disabledAt: true, status: true },
    });
    for (const u of users) add(u, {});
  }
  return [...out.values()].sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name));
}

/** Is this person on the project (lead, owner, member, or task holder)? */
export async function isOnProject(userId: string, projectId: string): Promise<boolean> {
  const [project, member, task] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { leadId: true, ownerId: true } }),
    prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { userId: true } }),
    prisma.task.findFirst({ where: { projectId, assigneeId: userId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!project) return false;
  return project.leadId === userId || project.ownerId === userId || Boolean(member) || Boolean(task);
}

/** Idempotent "put this person on the project". */
export async function ensureMember(projectId: string, userId: string): Promise<void> {
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: {},
    create: { projectId, userId },
  });
}

/**
 * May this person RUN the project — add people, add/move milestones, edit its
 * dates? FOUNDER/DIRECTOR anywhere; the HOD of its department; the owner; a
 * member with canManage. A TEAM_LEAD or a plain member cannot.
 */
export async function canManageProject(user: { id: string; role: Role }, projectId: string): Promise<boolean> {
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

/** The people a review meeting invites: founder + lead + everyone holding a task in the milestone (or project). */
export async function reviewAttendeeIds(projectId: string, milestoneId: string | null): Promise<string[]> {
  const [project, founder, holders] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { leadId: true, ownerId: true } }),
    prisma.user.findFirst({ where: { role: "FOUNDER", disabledAt: null, status: "ACTIVE" }, select: { id: true } }),
    prisma.task.findMany({
      where: { projectId, deletedAt: null, archived: false, assigneeId: { not: null }, ...(milestoneId ? { milestoneId } : {}) },
      select: { assigneeId: true },
      distinct: ["assigneeId"],
    }),
  ]);
  const ids = new Set<string>();
  if (founder) ids.add(founder.id);
  if (project?.leadId) ids.add(project.leadId);
  if (project?.ownerId) ids.add(project.ownerId);
  for (const h of holders) if (h.assigneeId) ids.add(h.assigneeId);
  const active = await prisma.user.findMany({
    where: { id: { in: [...ids] }, disabledAt: null, status: "ACTIVE", role: { notIn: ["PERSON", "ADMIN"] } },
    select: { id: true },
  });
  return active.map((u) => u.id);
}
