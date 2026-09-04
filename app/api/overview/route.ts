import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { visibleProjectIds } from "@/lib/project-visibility";
import { STATUSES, type OverviewDTO, type OverviewProject, type Status } from "@/lib/types";
import { AT_RISK_DAYS } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPARKLINE_DAYS = 14;
const DAY_MS = 86_400_000;
const RECENT_LIMIT = 10;

/**
 * Buckets are UTC days. For a single-user tracker the drift against local
 * midnight is a few hours at worst, and it keeps the endpoint parameterless.
 */
function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** ISO week: Monday is day one. */
function startOfIsoWeek(now: Date): number {
  const midnight = utcMidnight(now);
  const weekday = new Date(midnight).getUTCDay(); // 0 = Sunday
  const sinceMonday = (weekday + 6) % 7;
  return midnight - sinceMonday * DAY_MS;
}

const NEXT_UP_RANK: Record<string, number> = {
  IN_PROGRESS: 0,
  PLANNED: 1,
  BACKLOG: 2,
};

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

const WEEKS_WINDOW = 8;

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const visible = await visibleProjectIds(user);

  // Optional department scope (phase 12): the same aggregation, restricted to one
  // department's tools. Intersects with visibility, so a developer only ever
  // rolls up the tools they can see inside that department.
  const departmentId = new URL(req.url).searchParams.get("departmentId");
  const projectFilter = {
    ...(visible ? { id: { in: [...visible] } } : {}),
    ...(departmentId ? { departmentId } : {}),
  };
  const taskFilter = {
    ...(visible ? { projectId: { in: [...visible] } } : {}),
    ...(departmentId ? { project: { departmentId } } : {}),
  };

  // Two queries, then all the grouping happens in memory. At one human's
  // scale that beats a per-project round trip by a mile.
  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: projectFilter,
      orderBy: { orderKey: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        health: true,
        leadId: true,
        departmentId: true,
        priority: true,
        deadline: true,
        description: true,
        lead: { select: { name: true } },
      },
    }),
    prisma.task.findMany({
      // isPrivate:false keeps personal private tasks (phase 15) out of every
      // rollup here — for a lead, taskFilter is {} so this guard is what excludes
      // them from counts, workload, sparkline and completions.
      where: { deletedAt: null, isPrivate: false, ...taskFilter },
      select: {
        id: true,
        projectId: true,
        parentId: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        orderKey: true,
        completedAt: true,
        assigneeId: true,
        assignee: { select: { name: true } },
      },
    }),
  ]);

  const now = new Date();
  const today = utcMidnight(now);
  const weekStart = startOfIsoWeek(now);
  const sparkStart = today - (SPARKLINE_DAYS - 1) * DAY_MS;

  // A task is a leaf when nothing non-deleted points at it as parent.
  const hasChildren = new Set<string>();
  for (const task of tasks) {
    if (task.parentId) hasChildren.add(task.parentId);
  }

  const byProject = new Map<string, typeof tasks>();
  for (const task of tasks) {
    // isPrivate:false excludes null-project tasks; skip narrows the type.
    if (!task.projectId) continue;
    const list = byProject.get(task.projectId);
    if (list) list.push(task);
    else byProject.set(task.projectId, [task]);
  }

  const overviewProjects: OverviewProject[] = projects.map((project) => {
    const owned = byProject.get(project.id) ?? [];

    let totalLeaves = 0;
    let doneLeaves = 0;
    let inFlight = 0;
    let blocked = 0;
    let doneThisWeek = 0;
    const sparkline = new Array<number>(SPARKLINE_DAYS).fill(0);

    /* Schedule health and the per-person split are computed here, in the same
       single pass over the tasks this project already owns. Batch 2's charts
       read these rather than recounting client-side, so a dashboard and a row
       can never disagree about how many things are late. */
    const statusCounts = Object.fromEntries(
      STATUSES.map((s) => [s, 0]),
    ) as Record<Status, number>;
    let overdue = 0;
    let atRisk = 0;
    let unscheduled = 0;
    const assignees = new Map<string | null, { name: string; open: number; done: number }>();

    // Leaves first: a peek should name something you can actually pick up.
    // Containers stay eligible as a fallback, for a tool whose only remaining
    // work is closing a parent out.
    let leafPick: { id: string; title: string } | null = null;
    let leafRank: [number, number, number, string] | null = null;
    let anyPick: { id: string; title: string } | null = null;
    let anyRank: [number, number, number, string] | null = null;

    for (const task of owned) {
      const isLeaf = !hasChildren.has(task.id);

      // Cancelled work leaves the ratio entirely — numerator and denominator.
      if (isLeaf && task.status !== "CANCELLED") {
        totalLeaves++;
        if (task.status === "DONE") doneLeaves++;
      }

      if (task.status === "IN_PROGRESS") inFlight++;
      if (task.status === "BLOCKED") blocked++;
      statusCounts[task.status]++;

      const closed = task.status === "DONE" || task.status === "CANCELLED";
      if (!task.dueDate) {
        // Cancelled work is not "unscheduled", it is finished with.
        if (!closed) unscheduled++;
      } else if (!closed) {
        const days = Math.round((utcMidnight(task.dueDate) - today) / DAY_MS);
        if (days < 0) overdue++;
        else if (days <= AT_RISK_DAYS) atRisk++;
      }

      if (task.status !== "CANCELLED") {
        const key = task.assigneeId;
        const entry = assignees.get(key) ?? {
          name: task.assignee?.name ?? "Unassigned",
          open: 0,
          done: 0,
        };
        if (task.status === "DONE") entry.done++;
        else entry.open++;
        assignees.set(key, entry);
      }

      if (task.status === "DONE" && task.completedAt) {
        const completedDay = utcMidnight(task.completedAt);
        if (task.completedAt.getTime() >= weekStart) doneThisWeek++;
        if (completedDay >= sparkStart && completedDay <= today) {
          sparkline[Math.round((completedDay - sparkStart) / DAY_MS)]++;
        }
      }

      const statusRank = NEXT_UP_RANK[task.status];
      if (statusRank !== undefined) {
        const candidate: [number, number, number, string] = [
          statusRank,
          PRIORITY_RANK[task.priority] ?? 9,
          // Nulls last: a task with no due date sorts after every dated one.
          task.dueDate ? task.dueDate.getTime() : Number.MAX_SAFE_INTEGER,
          task.orderKey,
        ];
        if (anyRank === null || compareRank(candidate, anyRank) < 0) {
          anyRank = candidate;
          anyPick = { id: task.id, title: task.title };
        }
        if (isLeaf && (leafRank === null || compareRank(candidate, leafRank) < 0)) {
          leafRank = candidate;
          leafPick = { id: task.id, title: task.title };
        }
      }
    }

    const nextUp = leafPick ?? anyPick;

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      color: project.color,
      health: project.health,
      totalLeaves,
      doneLeaves,
      inFlight,
      blocked,
      doneThisWeek,
      sparkline,
      nextUp,
      leadId: project.leadId,
      leadName: project.lead?.name ?? null,
      departmentId: project.departmentId,
      priority: project.priority,
      deadline: project.deadline ? project.deadline.toISOString() : null,
      description: project.description,
      statusCounts,
      overdue,
      atRisk,
      unscheduled,
      perAssignee: [...assignees.entries()]
        .map(([userId, v]) => ({ userId, name: v.name, open: v.open, done: v.done }))
        .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
    };
  });

  // Completions per ISO week, oldest first, ending with the current week. Used
  // by the department (department) overview's trend bars; scoped to whatever the
  // task filter already narrowed us to.
  const weekWindowStart = weekStart - (WEEKS_WINDOW - 1) * 7 * DAY_MS;
  const weeklyCompletions = new Array<number>(WEEKS_WINDOW).fill(0);
  for (const task of tasks) {
    if (task.status !== "DONE" || !task.completedAt) continue;
    const completedDay = utcMidnight(task.completedAt);
    if (completedDay < weekWindowStart) continue;
    const wk = Math.floor((completedDay - weekWindowStart) / (7 * DAY_MS));
    if (wk >= 0 && wk < WEEKS_WINDOW) weeklyCompletions[wk]++;
  }

  const recent = tasks
    .filter((t) => t.status === "DONE" && t.completedAt)
    .sort((a, b) => (b.completedAt as Date).getTime() - (a.completedAt as Date).getTime())
    .slice(0, RECENT_LIMIT)
    .map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId ?? "",
      completedAt: (t.completedAt as Date).toISOString(),
    }));

  const payload: OverviewDTO = {
    projects: overviewProjects,
    global: {
      shippedThisWeek: overviewProjects.reduce((n, p) => n + p.doneThisWeek, 0),
      inFlight: overviewProjects.reduce((n, p) => n + p.inFlight, 0),
      blocked: overviewProjects.reduce((n, p) => n + p.blocked, 0),
      overdue: overviewProjects.reduce((n, p) => n + p.overdue, 0),
      atRisk: overviewProjects.reduce((n, p) => n + p.atRisk, 0),
      unscheduled: overviewProjects.reduce((n, p) => n + p.unscheduled, 0),
      onHold: overviewProjects.reduce((n, p) => n + p.statusCounts.ON_HOLD, 0),
    },
    weeklyCompletions,
    recent,
  };

  return NextResponse.json(payload);
});

function compareRank(
  a: [number, number, number, string],
  b: [number, number, number, string],
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] - b[2];
  return a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0;
}
