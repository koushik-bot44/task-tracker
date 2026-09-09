/**
 * Teams, categories and rules (work model, 2026-09-09): who may shape the
 * organisation. The CEO anywhere; a head inside the departments they head;
 * a team lead over their own team's members.
 */
import type { Prisma, WorkState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import type { AssignmentGroupDTO, AssignmentRuleDTO, TaskCategoryDTO } from "@/lib/types";
import type { Actor, Scope } from "@/lib/work/access";

const OPEN: WorkState[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "ESCALATED", "REOPENED"];
export const GROUP_INCLUDE = {
  department: { select: { name: true } },
  lead: { select: { id: true, name: true } },
  members: { orderBy: { createdAt: "asc" as const }, select: { user: { select: { id: true, name: true, role: true, disabledAt: true, status: true } } } },
  _count: { select: { tasks: { where: { deletedAt: null, isPrivate: false, parentId: null, state: { in: OPEN } } } } },
} satisfies Prisma.AssignmentGroupInclude;
export type GroupRow = Prisma.AssignmentGroupGetPayload<{ include: typeof GROUP_INCLUDE }>;

export function serializeGroup(g: GroupRow): AssignmentGroupDTO {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    departmentId: g.departmentId,
    departmentName: g.department.name,
    leadId: g.leadId,
    leadName: g.lead?.name ?? null,
    active: g.active,
    orderKey: g.orderKey,
    createdAt: g.createdAt.toISOString(),
    members: g.members.filter((m) => !m.user.disabledAt && m.user.status === "ACTIVE").map((m) => ({ id: m.user.id, name: m.user.name, role: m.user.role })),
    openTasks: g._count.tasks,
  };
}

/** May the actor create or reshape teams in this department? */
export function assertCanShapeDepartment(actor: Actor, scope: Scope, departmentId: string): void {
  if (scope.all) return;
  if (actor.role === "HOD" && scope.headedDepartmentIds.has(departmentId)) return;
  throw new HttpError(403, "Only the CEO or the head of this department can do that.");
}

/** May the actor change who is on this team? The department's shapers, and the team's lead. */
export async function assertCanShapeGroup(actor: Actor, scope: Scope, groupId: string): Promise<{ departmentId: string }> {
  const g = await prisma.assignmentGroup.findUnique({ where: { id: groupId }, select: { departmentId: true, leadId: true } });
  if (!g) throw new HttpError(404, "Team not found");
  if (scope.all || g.leadId === actor.id || (actor.role === "HOD" && scope.headedDepartmentIds.has(g.departmentId))) return { departmentId: g.departmentId };
  throw new HttpError(403, "Only the CEO, the head of the department or the team's lead can do that.");
}

export const CATEGORY_INCLUDE = { assignmentGroup: { select: { name: true } } } as const;
export type CategoryRow = Prisma.TaskCategoryGetPayload<{ include: typeof CATEGORY_INCLUDE }>;
export function serializeCategory(c: CategoryRow): TaskCategoryDTO {
  return {
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    departmentId: c.departmentId,
    assignmentGroupId: c.assignmentGroupId,
    assignmentGroupName: c.assignmentGroup?.name ?? null,
    active: c.active,
    orderKey: c.orderKey,
  };
}

export function serializeRule(r: { id: string; name: string; order: number; active: boolean; match: unknown; set: unknown }): AssignmentRuleDTO {
  return { id: r.id, name: r.name, order: r.order, active: r.active, match: (r.match ?? {}) as AssignmentRuleDTO["match"], set: (r.set ?? {}) as AssignmentRuleDTO["set"] };
}

/** Active work accounts among `ids` — the only people who may be on a team. */
export async function workAccounts(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] }, disabledAt: null, role: { notIn: ["PERSON", "ADMIN"] } }, select: { id: true } });
  return rows.map((r) => r.id);
}
