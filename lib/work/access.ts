/**
 * Who may do what to a task (work model, 2026-09-09). The single door for the
 * task routes and services; the client only mirrors it to hide buttons.
 *
 * The chain: Department → Team → Person. A task is SEEN by the CEO, by the
 * people on it (who asked, who holds it, who gave it), by its department and
 * its team, and by whoever could see its project before. It is WORKED by the
 * people on it, its team, the head of its department and the CEO — not by
 * everyone who can merely see it (that was the old rule and it let a
 * bystander delete a department's tasks).
 */
import type { Role, Task, WorkState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLeadOrAboveRole, isManagerRole } from "@/lib/roles";
import { HttpError } from "@/lib/session";
import { isOnProject } from "@/lib/project-people";
import { canSeeProject, visibleProjectIds } from "@/lib/project-visibility";
import type { TaskAccessDTO } from "@/lib/types";
import { canTransition, isFinished, TRANSITIONS } from "@/lib/work/workflow";

export type Actor = { id: string; role: Role };

/** The columns every access decision reads. */
export const TASK_ACCESS_SELECT = {
  id: true,
  isPrivate: true,
  ownerId: true,
  projectId: true,
  departmentId: true,
  assignmentGroupId: true,
  assigneeId: true,
  requesterId: true,
  givenById: true,
  parentId: true,
  type: true,
  state: true,
  deletedAt: true,
} as const;
export type TaskAccessRow = Pick<Task, keyof typeof TASK_ACCESS_SELECT>;

export type Scope = {
  all: boolean;
  /** Own department plus the ones headed. */
  departmentIds: Set<string>;
  headedDepartmentIds: Set<string>;
  groupIds: Set<string>;
  ledGroupIds: Set<string>;
  /** Null = every project (the CEO). */
  projectIds: Set<string> | null;
};

/** What the actor reaches, in one place; load once per request. */
export async function loadScope(actor: Actor): Promise<Scope> {
  if (actor.role === "PERSON" || actor.role === "ADMIN") {
    throw new HttpError(403, "Not available for this account.");
  }
  if (actor.role === "FOUNDER") {
    return { all: true, departmentIds: new Set(), headedDepartmentIds: new Set(), groupIds: new Set(), ledGroupIds: new Set(), projectIds: null };
  }
  const [me, headed, memberships, led, projectIds] = await Promise.all([
    prisma.user.findUnique({ where: { id: actor.id }, select: { departmentId: true } }),
    actor.role === "HOD" ? prisma.department.findMany({ where: { hodId: actor.id }, select: { id: true } }) : Promise.resolve([]),
    prisma.assignmentGroupMember.findMany({ where: { userId: actor.id }, select: { groupId: true } }),
    prisma.assignmentGroup.findMany({ where: { leadId: actor.id }, select: { id: true } }),
    visibleProjectIds(actor),
  ]);
  const departmentIds = new Set<string>();
  if (me?.departmentId) departmentIds.add(me.departmentId);
  const headedDepartmentIds = new Set(headed.map((d) => d.id));
  for (const id of headedDepartmentIds) departmentIds.add(id);
  const groupIds = new Set(memberships.map((m) => m.groupId));
  const ledGroupIds = new Set(led.map((g) => g.id));
  for (const id of ledGroupIds) groupIds.add(id);
  return { all: false, departmentIds, headedDepartmentIds, groupIds, ledGroupIds, projectIds };
}

/** The row an access check reads: a step is judged by its root task. */
export async function loadAccessRow(taskId: string): Promise<{ task: TaskAccessRow; root: TaskAccessRow } | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: TASK_ACCESS_SELECT });
  if (!task) return null;
  if (!task.parentId) return { task, root: task };
  const root = await prisma.task.findUnique({ where: { id: task.parentId }, select: TASK_ACCESS_SELECT });
  return { task, root: root ?? task };
}

function onIt(actor: Actor, t: TaskAccessRow): boolean {
  return t.assigneeId === actor.id || t.requesterId === actor.id || t.givenById === actor.id;
}

function headsIt(scope: Scope, t: TaskAccessRow): boolean {
  return Boolean(t.departmentId && scope.headedDepartmentIds.has(t.departmentId));
}

function teamed(scope: Scope, t: TaskAccessRow): boolean {
  return Boolean(t.assignmentGroupId && scope.groupIds.has(t.assignmentGroupId));
}

function leadsTeam(scope: Scope, t: TaskAccessRow): boolean {
  return Boolean(t.assignmentGroupId && scope.ledGroupIds.has(t.assignmentGroupId));
}

/** May the actor READ this task at all? */
export async function canSeeTask(actor: Actor, t: TaskAccessRow, scope: Scope): Promise<boolean> {
  if (t.isPrivate) return t.ownerId === actor.id;
  if (scope.all) return true;
  if (onIt(actor, t) || teamed(scope, t)) return true;
  if (t.departmentId && scope.departmentIds.has(t.departmentId)) return true;
  if (t.projectId) return scope.projectIds === null || scope.projectIds.has(t.projectId);
  return false;
}

/**
 * STAFF on a task read its team notes (INTERNAL activity). The CEO, the head
 * of its department, its team, its holder, the people running its project,
 * and any lead or above who is in its department. Someone who only ASKED for
 * it sees the public notes alone — that is the whole point of a team note.
 */
export async function isStaffOnTask(actor: Actor, t: TaskAccessRow, scope: Scope): Promise<boolean> {
  if (t.isPrivate) return t.ownerId === actor.id;
  if (scope.all || headsIt(scope, t) || teamed(scope, t) || t.assigneeId === actor.id || t.givenById === actor.id) return true;
  if (isLeadOrAboveRole(actor.role) && t.departmentId && scope.departmentIds.has(t.departmentId)) return true;
  if (t.projectId && isLeadOrAboveRole(actor.role) && (scope.projectIds === null || scope.projectIds.has(t.projectId))) return true;
  if (t.projectId) return isOnProject(actor.id, t.projectId);
  return false;
}

/**
 * May the actor CHANGE the record (title, words, date, priority, category,
 * context, steps)? The CEO; the department head; the holder; the one who
 * asked (while it is open); the team; on a project, the people running it
 * and anyone on it. Merely seeing a department's project is not enough.
 */
export async function canEditTask(actor: Actor, t: TaskAccessRow, scope: Scope): Promise<boolean> {
  if (t.isPrivate) return t.ownerId === actor.id;
  if (scope.all || headsIt(scope, t) || teamed(scope, t) || t.assigneeId === actor.id || t.givenById === actor.id) return true;
  if (t.requesterId === actor.id && !isFinished(t.state)) return true;
  if (t.projectId) {
    if (isManagerRole(actor.role) && (await canSeeProject(actor, t.projectId))) return true;
    return isOnProject(actor.id, t.projectId);
  }
  // A standalone task in the actor's own department: leads and above may run it.
  return Boolean(t.departmentId && scope.departmentIds.has(t.departmentId) && isLeadOrAboveRole(actor.role));
}

/** May the actor pick who holds it (or which team)? */
export async function canAssignTask(actor: Actor, t: TaskAccessRow, scope: Scope): Promise<boolean> {
  if (t.isPrivate) return false;
  if (scope.all || headsIt(scope, t) || leadsTeam(scope, t) || teamed(scope, t)) return true;
  if (t.assigneeId === actor.id || t.givenById === actor.id) return true;
  if (t.projectId) {
    if (isLeadOrAboveRole(actor.role) && (await canSeeProject(actor, t.projectId))) return true;
    return isOnProject(actor.id, t.projectId);
  }
  return Boolean(t.departmentId && scope.departmentIds.has(t.departmentId) && isLeadOrAboveRole(actor.role));
}

/** May the actor make it vanish (soft delete)? Tighter than editing. */
export async function canDeleteTask(actor: Actor, t: TaskAccessRow, scope: Scope): Promise<boolean> {
  if (t.isPrivate) return t.ownerId === actor.id;
  if (scope.all || headsIt(scope, t) || leadsTeam(scope, t) || t.givenById === actor.id) return true;
  if (t.requesterId === actor.id && (t.state === "NEW" || t.state === "ASSIGNED")) return true;
  if (t.projectId && isLeadOrAboveRole(actor.role)) return isOnProject(actor.id, t.projectId) || (await canSeeProject(actor, t.projectId));
  return false;
}

/**
 * May the actor move the task to `to`? Checks the machine first, then who.
 *   start / put back    the holder, or anyone who may assign (they take it)
 *   waiting / escalate  the holder, the team, the head, the CEO, project leads
 *   resolve             PROJECT_TASK: a lead or above (the owner's tick rule);
 *                       otherwise the holder too
 *   close               who asked, the head, the team lead, leads and above
 *   reopen              who asked, the holder, leads and above
 *   cancel              who asked (while new), leads and above, the head
 */
export async function canTransitionTask(actor: Actor, t: TaskAccessRow, to: WorkState, scope: Scope): Promise<boolean> {
  if (t.isPrivate) return t.ownerId === actor.id;
  if (!canTransition(t.state, to)) return false;
  if (scope.all || headsIt(scope, t)) return true;
  const holder = t.assigneeId === actor.id;
  const team = teamed(scope, t);
  const lead = isLeadOrAboveRole(actor.role);
  const onProject = t.projectId ? await isOnProject(actor.id, t.projectId) : false;
  const projectLead = Boolean(t.projectId && lead && (onProject || (await canSeeProject(actor, t.projectId!))));
  const deptLead = Boolean(t.departmentId && scope.departmentIds.has(t.departmentId) && lead);
  switch (to) {
    case "IN_PROGRESS":
    case "ASSIGNED":
    case "NEW":
      return holder || team || projectLead || deptLead || onProject || (await canAssignTask(actor, t, scope));
    case "WAITING":
    case "ESCALATED":
      return holder || team || projectLead || deptLead || onProject;
    case "RESOLVED":
      if (t.type === "PROJECT_TASK") return projectLead || deptLead || leadsTeam(scope, t);
      return holder || team || projectLead || deptLead;
    case "CLOSED":
      return t.requesterId === actor.id || leadsTeam(scope, t) || projectLead || deptLead;
    case "REOPENED":
      return t.requesterId === actor.id || holder || projectLead || deptLead || leadsTeam(scope, t);
    case "CANCELLED":
      return (t.requesterId === actor.id && (t.state === "NEW" || t.state === "ASSIGNED")) || projectLead || deptLead || leadsTeam(scope, t);
  }
}

/** Every move the actor may make from here — what the record page offers. */
export async function allowedTransitions(actor: Actor, t: TaskAccessRow, scope: Scope): Promise<WorkState[]> {
  const out: WorkState[] = [];
  for (const to of TRANSITIONS[t.state]) if (await canTransitionTask(actor, t, to, scope)) out.push(to);
  return out;
}

export type { TaskAccessDTO };

export async function taskAccess(actor: Actor, t: TaskAccessRow, scope: Scope): Promise<TaskAccessDTO> {
  const [canEdit, canAssign, canDelete, staff, transitions] = await Promise.all([
    canEditTask(actor, t, scope),
    canAssignTask(actor, t, scope),
    canDeleteTask(actor, t, scope),
    isStaffOnTask(actor, t, scope),
    allowedTransitions(actor, t, scope),
  ]);
  return { canEdit, canAssign, canDelete, staff, transitions };
}

/** Throw the plain 404 every task route uses when the actor may not see it. */
export function notFound(): never {
  throw new HttpError(404, "Task not found");
}
