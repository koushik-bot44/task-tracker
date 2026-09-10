import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import type { DashboardTodayDTO } from "@/lib/types";
import { loadScope } from "@/lib/work/access";
import { countTasks, counters, departmentBreakdown, filterWhere, listWork } from "@/lib/work/query";

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
  const runsDepartments = scope.all || scope.headedDepartmentIds.size > 0;
  const nothing = { items: [], nextCursor: null, total: 0 };
  // The totals the Work tabs show count TASKS: the same task given to several
  // people is several records but one row on the list (review, 2026-09-10).
  const [c, mine, team, department, departments, groups, myWorkTotal, teamWorkTotal, departmentWorkTotal, everythingTotal] = await Promise.all([
    counters(base),
    listWork(user, scope, { mine: "assigned", sort: "due", limit: 20 }),
    scope.groupIds.size ? listWork(user, scope, { mine: "team", sort: "due", limit: 20 }) : Promise.resolve(nothing),
    runsDepartments ? listWork(user, scope, { mine: "department", unassigned: true, sort: "created", limit: 20 }) : Promise.resolve(nothing),
    runsDepartments ? departmentBreakdown(user, scope) : Promise.resolve([]),
    scope.groupIds.size ? prisma.assignmentGroup.findMany({ where: { id: { in: [...scope.groupIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
    countTasks(filterWhere(user, scope, { mine: "assigned" })),
    scope.groupIds.size ? countTasks(filterWhere(user, scope, { mine: "team" })) : Promise.resolve(0),
    runsDepartments ? countTasks(filterWhere(user, scope, { mine: "department", unassigned: true })) : Promise.resolve(0),
    scope.all ? countTasks(filterWhere(user, scope, {})) : Promise.resolve(null),
  ]);
  const payload: DashboardTodayDTO = {
    level,
    counters: c,
    myWork: mine.items,
    myWorkTotal,
    teamWork: team.items,
    teamWorkTotal,
    teams: groups,
    departmentWork: department.items,
    departmentWorkTotal,
    departments: departments.map((d) => ({ id: d.id, name: d.name, color: d.color, open: d.open, inProgress: d.inProgress, waiting: d.waiting, overdue: d.overdue, unassigned: d.unassigned })),
    everythingTotal,
  };
  return NextResponse.json(payload);
});
