import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import type { DashboardTodayDTO } from "@/lib/types";
import { loadScope } from "@/lib/work/access";
import { counters, departmentBreakdown, filterWhere, listWork, visibilityWhere } from "@/lib/work/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Today, the work half (work model): counters over what the caller runs, then
 * My work · Team work · Department work, and the department line for heads and
 * the CEO. Meetings and the project summary stay on GET /api/today.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const scope = await loadScope(user);
  // Counters cover what the caller is responsible for: the company (CEO), the
  // headed departments (a head), their teams (a lead), else their own work.
  const base = scope.all
    ? {}
    : scope.headedDepartmentIds.size
      ? { departmentId: { in: [...scope.headedDepartmentIds] } }
      : scope.ledGroupIds.size
        ? { assignmentGroupId: { in: [...scope.ledGroupIds] } }
        : { OR: [{ assigneeId: user.id }, { requesterId: user.id }] };
  const level: DashboardTodayDTO["level"] = scope.all ? "company" : scope.headedDepartmentIds.size ? "department" : scope.ledGroupIds.size ? "team" : "mine";
  const [c, mine, team, department, departments, groups] = await Promise.all([
    counters(base),
    listWork(user, scope, { mine: "assigned", sort: "due", limit: 20 }),
    scope.groupIds.size ? listWork(user, scope, { mine: "team", sort: "due", limit: 20 }) : Promise.resolve({ items: [], nextCursor: null, total: 0 }),
    scope.all || scope.headedDepartmentIds.size ? listWork(user, scope, { mine: "department", unassigned: true, sort: "created", limit: 20 }) : Promise.resolve({ items: [], nextCursor: null, total: 0 }),
    scope.all || scope.headedDepartmentIds.size ? departmentBreakdown(user, scope) : Promise.resolve([]),
    scope.groupIds.size ? prisma.assignmentGroup.findMany({ where: { id: { in: [...scope.groupIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const everything = scope.all ? await prisma.task.count({ where: filterWhere(user, scope, {}) }) : null;
  void visibilityWhere;
  const payload: DashboardTodayDTO = {
    level,
    counters: c,
    myWork: mine.items,
    myWorkTotal: mine.total,
    teamWork: team.items,
    teamWorkTotal: team.total,
    teams: groups,
    departmentWork: department.items,
    departmentWorkTotal: department.total,
    departments: departments.map((d) => ({ id: d.id, name: d.name, color: d.color, open: d.open, inProgress: d.inProgress, waiting: d.waiting, overdue: d.overdue, unassigned: d.unassigned })),
    everythingTotal: everything,
  };
  return NextResponse.json(payload);
});
