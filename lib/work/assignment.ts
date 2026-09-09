/**
 * Assignment (work model, 2026-09-09): Department → Team → Person.
 *
 *   routeWork            the deterministic rules — a category's default team,
 *                        then AssignmentRule rows in order; first match per
 *                        field wins. No one is hard-coded anywhere.
 *   assertAssigneeAllowed  may THIS person hold THIS task? With a team on the
 *                        task, only its members; on a project, the old rule
 *                        (on it, or a lead names anyone and they join); with
 *                        neither, a lead or above names anyone, a team member
 *                        only themselves.
 */
import type { Prisma, WorkPriority, WorkType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLeadOrAboveRole } from "@/lib/roles";
import { HttpError } from "@/lib/session";
import { isOnProject } from "@/lib/project-people";
import type { Actor, Scope } from "@/lib/work/access";

export type RouteInput = {
  type: WorkType;
  categoryId: string | null;
  departmentId: string | null;
  priority: WorkPriority;
  assignmentGroupId: string | null;
  assigneeId: string | null;
};

export type RouteResult = RouteInput & {
  escalate: boolean;
  /** What decided each field, in the words the activity stream prints. */
  applied: string[];
};

type RuleMatch = { type?: WorkType; categoryId?: string; departmentId?: string; priority?: WorkPriority };
type RuleSet = { departmentId?: string; assignmentGroupId?: string; assigneeId?: string; priority?: WorkPriority; escalate?: boolean };

export async function routeWork(input: RouteInput): Promise<RouteResult> {
  const out: RouteResult = { ...input, escalate: false, applied: [] };

  if (out.categoryId) {
    const cat = await prisma.taskCategory.findUnique({
      where: { id: out.categoryId },
      select: { name: true, departmentId: true, assignmentGroupId: true, assignmentGroup: { select: { name: true, departmentId: true } } },
    });
    if (cat) {
      if (!out.assignmentGroupId && cat.assignmentGroupId && cat.assignmentGroup) {
        out.assignmentGroupId = cat.assignmentGroupId;
        out.applied.push(`Category ${cat.name} → ${cat.assignmentGroup.name}`);
        if (!out.departmentId) out.departmentId = cat.assignmentGroup.departmentId;
      }
      if (!out.departmentId && cat.departmentId) out.departmentId = cat.departmentId;
    }
  }

  const rules = await prisma.assignmentRule.findMany({ where: { active: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  for (const rule of rules) {
    const match = (rule.match ?? {}) as RuleMatch;
    const set = (rule.set ?? {}) as RuleSet;
    const hits =
      (match.type === undefined || match.type === out.type) &&
      (match.categoryId === undefined || match.categoryId === out.categoryId) &&
      (match.departmentId === undefined || match.departmentId === out.departmentId) &&
      (match.priority === undefined || match.priority === out.priority);
    if (!hits) continue;
    let used = false;
    if (set.assignmentGroupId && !out.assignmentGroupId) { out.assignmentGroupId = set.assignmentGroupId; used = true; }
    if (set.departmentId && !out.departmentId) { out.departmentId = set.departmentId; used = true; }
    if (set.assigneeId && !out.assigneeId) { out.assigneeId = set.assigneeId; used = true; }
    if (set.priority && set.priority !== out.priority) { out.priority = set.priority; used = true; }
    if (set.escalate) { out.escalate = true; used = true; }
    if (used) out.applied.push(`Rule: ${rule.name}`);
  }

  if (out.assignmentGroupId && !out.departmentId) {
    const g = await prisma.assignmentGroup.findUnique({ where: { id: out.assignmentGroupId }, select: { departmentId: true } });
    if (g) out.departmentId = g.departmentId;
  }
  return out;
}

export type AssigneeCheck = {
  /** Put this person on the project once the save has gone through. */
  addToProject: boolean;
};

/**
 * May `assigneeId` hold a task that sits with `groupId` (and `projectId`)?
 * Throws 400 with a plain reason. Side effects are NOT taken here: the
 * caller adds the person to the project after the row is written, so a
 * refused save leaves no trace (the old rule added them first).
 */
export async function assertAssigneeAllowed(
  tx: Prisma.TransactionClient | typeof prisma,
  actor: Actor,
  scope: Scope,
  task: { projectId: string | null; departmentId: string | null },
  groupId: string | null,
  assigneeId: string | null,
): Promise<AssigneeCheck> {
  if (!assigneeId) return { addToProject: false };
  const target = await tx.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, role: true, disabledAt: true, status: true, departmentId: true },
  });
  // An invited person (PENDING) may already hold work: the invite mail and the
  // task mail both reach them, and the task waits on their first sign-in.
  if (!target || target.disabledAt || target.role === "PERSON" || target.role === "ADMIN") {
    throw new HttpError(400, "Pick someone who is on Orbit.");
  }
  if (groupId) {
    const group = await tx.assignmentGroup.findUnique({
      where: { id: groupId },
      select: { name: true, leadId: true, members: { where: { userId: assigneeId }, select: { id: true } } },
    });
    if (!group) throw new HttpError(400, "That team does not exist.");
    if (group.leadId !== assigneeId && group.members.length === 0) {
      throw new HttpError(400, `Pick someone on the ${group.name} team, or add them to it first.`);
    }
    return { addToProject: false };
  }
  if (task.projectId) {
    if (await isOnProject(assigneeId, task.projectId)) return { addToProject: false };
    if (isLeadOrAboveRole(actor.role) || scope.all || (task.departmentId ? scope.headedDepartmentIds.has(task.departmentId) : false)) {
      return { addToProject: true };
    }
    throw new HttpError(400, "Pick someone on this project, or ask a manager to add them.");
  }
  // Standalone, no team: a lead or above may name anyone; a team member only themselves.
  if (assigneeId === actor.id || scope.all || isLeadOrAboveRole(actor.role)) return { addToProject: false };
  throw new HttpError(400, "Only a team lead or above can give this to someone else.");
}

/** Everyone who may be picked for a team: its members (and its lead), active only. */
export async function groupMemberIds(groupId: string): Promise<string[]> {
  const g = await prisma.assignmentGroup.findUnique({
    where: { id: groupId },
    select: { leadId: true, members: { select: { userId: true } } },
  });
  if (!g) return [];
  const ids = new Set(g.members.map((m) => m.userId));
  if (g.leadId) ids.add(g.leadId);
  return [...ids];
}
