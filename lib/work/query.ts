/**
 * Queues and counters (work model, 2026-09-09). One place builds the WHERE
 * for "what this person may see", so the Work list, the department pages,
 * a team's queue and Today's counters can never disagree.
 */
import type { Prisma, WorkPriority, WorkState, WorkType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TASK_INCLUDE, serializeTask, withCounts } from "@/lib/serialize";
import { istDayKey, istDayRange } from "@/lib/timezone";
import { OPEN_STATES, type TaskDTO } from "@/lib/types";
import type { Actor, Scope } from "@/lib/work/access";
import { noteCounts } from "@/lib/work/activity";

/** Live, non-private work: the base of every queue. */
export const LIVE: Prisma.TaskWhereInput = { deletedAt: null, isPrivate: false, parentId: null };

/** What the actor may see, as a WHERE. Mirrors access.canSeeTask exactly. */
export function visibilityWhere(actor: Actor, scope: Scope): Prisma.TaskWhereInput {
  if (scope.all) return {};
  const or: Prisma.TaskWhereInput[] = [
    { requesterId: actor.id },
    { assigneeId: actor.id },
    { givenById: actor.id },
  ];
  if (scope.departmentIds.size) or.push({ departmentId: { in: [...scope.departmentIds] } });
  if (scope.groupIds.size) or.push({ assignmentGroupId: { in: [...scope.groupIds] } });
  if (scope.projectIds === null) or.push({ projectId: { not: null } });
  else if (scope.projectIds.size) or.push({ projectId: { in: [...scope.projectIds] } });
  return { OR: or };
}

export type WorkFilter = {
  q?: string;
  state?: WorkState[];
  priority?: WorkPriority[];
  type?: WorkType[];
  departmentId?: string;
  assignmentGroupId?: string;
  assigneeId?: string;
  requesterId?: string;
  projectId?: string;
  milestoneId?: string;
  unassigned?: boolean;
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
  createdFrom?: string;
  createdTo?: string;
  /** Shortcuts for the four tabs. */
  mine?: "assigned" | "requested" | "team" | "department";
  /** Default true: open work only. `false` = everything, `finished` = the other half. */
  open?: "true" | "false" | "finished";
  sort?: "updated" | "due" | "priority" | "created" | "number";
  cursor?: string;
  limit?: number;
};

const REF = /^([A-Z])-(\d+)$/i;

export function filterWhere(actor: Actor, scope: Scope, f: WorkFilter, now = new Date()): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [LIVE, visibilityWhere(actor, scope)];
  const open = f.open ?? "true";
  if (open === "true") and.push({ state: { in: [...OPEN_STATES] } });
  else if (open === "finished") and.push({ state: { notIn: [...OPEN_STATES] } });
  if (f.state?.length) and.push({ state: { in: f.state } });
  if (f.priority?.length) and.push({ priority: { in: f.priority } });
  if (f.type?.length) and.push({ type: { in: f.type } });
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  if (f.assignmentGroupId) and.push({ assignmentGroupId: f.assignmentGroupId });
  if (f.assigneeId) and.push({ assigneeId: f.assigneeId });
  if (f.requesterId) and.push({ requesterId: f.requesterId });
  if (f.projectId) and.push({ projectId: f.projectId });
  if (f.milestoneId) and.push({ milestoneId: f.milestoneId });
  if (f.unassigned) and.push({ assigneeId: null });
  if (f.overdue) and.push({ dueDate: { lt: istDayRange(istDayKey(now)).start }, state: { in: [...OPEN_STATES] } });
  if (f.dueFrom || f.dueTo) and.push({ dueDate: { ...(f.dueFrom ? { gte: new Date(f.dueFrom) } : {}), ...(f.dueTo ? { lte: new Date(f.dueTo) } : {}) } });
  if (f.createdFrom || f.createdTo) and.push({ createdAt: { ...(f.createdFrom ? { gte: new Date(f.createdFrom) } : {}), ...(f.createdTo ? { lte: new Date(f.createdTo) } : {}) } });
  switch (f.mine) {
    case "assigned":
      and.push({ assigneeId: actor.id });
      break;
    case "requested":
      and.push({ requesterId: actor.id });
      break;
    case "team":
      and.push(scope.groupIds.size ? { assignmentGroupId: { in: [...scope.groupIds] } } : { id: "" });
      break;
    case "department":
      and.push(scope.all ? {} : scope.departmentIds.size ? { departmentId: { in: [...scope.departmentIds] } } : { id: "" });
      break;
  }
  if (f.q?.trim()) {
    const q = f.q.trim();
    const ref = REF.exec(q);
    const or: Prisma.TaskWhereInput[] = [
      { title: { contains: q, mode: "insensitive" } },
      { descriptionMd: { contains: q, mode: "insensitive" } },
      { requester: { name: { contains: q, mode: "insensitive" } } },
      { assignee: { name: { contains: q, mode: "insensitive" } } },
      { department: { name: { contains: q, mode: "insensitive" } } },
      { assignmentGroup: { name: { contains: q, mode: "insensitive" } } },
      { project: { name: { contains: q, mode: "insensitive" } } },
      { milestone: { name: { contains: q, mode: "insensitive" } } },
    ];
    if (ref) or.push({ number: Number(ref[2]) });
    else if (/^\d+$/.test(q)) or.push({ number: Number(q) });
    and.push({ OR: or });
  }
  return { AND: and };
}

const PRIORITY_ORDER: Record<WorkPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export type WorkListDTO = { items: TaskDTO[]; nextCursor: string | null; total: number };

export async function listWork(actor: Actor, scope: Scope, f: WorkFilter): Promise<WorkListDTO> {
  const where = filterWhere(actor, scope, f);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    f.sort === "due"
      ? [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "desc" }]
      : f.sort === "created"
        ? [{ createdAt: "desc" }]
        : f.sort === "number"
          ? [{ number: "desc" }]
          : f.sort === "priority"
            ? [{ priority: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }]
            : [{ updatedAt: "desc" }];
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
      include: TASK_INCLUDE,
    }),
    prisma.task.count({ where }),
  ]);
  const page = rows.slice(0, limit);
  if (f.sort === "priority") page.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const counts = await noteCounts(page.map((r) => r.id), true);
  return {
    items: withCounts(page, counts).map(serializeTask),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    total,
  };
}

export type Counters = {
  open: number;
  unassigned: number;
  highPriority: number;
  dueToday: number;
  overdue: number;
  waiting: number;
  resolvedToday: number;
  newToday: number;
};

/** The Today strip, over any base WHERE (the caller scopes it). */
export async function counters(base: Prisma.TaskWhereInput, now = new Date()): Promise<Counters> {
  const day = istDayRange(istDayKey(now));
  const open: Prisma.TaskWhereInput = { AND: [LIVE, base, { state: { in: [...OPEN_STATES] } }] };
  const [openN, unassigned, highPriority, dueToday, overdue, waiting, resolvedToday, newToday] = await Promise.all([
    prisma.task.count({ where: open }),
    prisma.task.count({ where: { AND: [open, { assigneeId: null }] } }),
    prisma.task.count({ where: { AND: [open, { priority: { in: ["CRITICAL", "HIGH"] } }] } }),
    prisma.task.count({ where: { AND: [open, { dueDate: { gte: day.start, lte: day.end } }] } }),
    prisma.task.count({ where: { AND: [open, { dueDate: { lt: day.start } }] } }),
    prisma.task.count({ where: { AND: [open, { state: "WAITING" }] } }),
    prisma.task.count({ where: { AND: [LIVE, base, { resolvedAt: { gte: day.start, lte: day.end } }] } }),
    prisma.task.count({ where: { AND: [LIVE, base, { createdAt: { gte: day.start, lte: day.end } }] } }),
  ]);
  return { open: openN, unassigned, highPriority, dueToday, overdue, waiting, resolvedToday, newToday };
}

export type Tally = { open: number; inProgress: number; waiting: number; overdue: number; unassigned: number };
export type PersonTally = { id: string; name: string } & Tally;
export type TeamTally = { id: string; name: string; leadId: string | null; leadName: string | null; people: PersonTally[] } & Tally;
export type DepartmentTally = { id: string; name: string; color: string; hodId: string | null; hodName: string | null; teams: TeamTally[]; unteamed: Tally } & Tally;

function tallyOf(rows: { state: WorkState; assigneeId: string | null; dueDate: Date | null }[], dayStart: Date): Tally {
  const t: Tally = { open: 0, inProgress: 0, waiting: 0, overdue: 0, unassigned: 0 };
  for (const r of rows) {
    if (!OPEN_STATES.includes(r.state)) continue;
    t.open++;
    if (r.state === "IN_PROGRESS" || r.state === "ESCALATED") t.inProgress++;
    if (r.state === "WAITING") t.waiting++;
    if (r.dueDate && r.dueDate < dayStart) t.overdue++;
    if (!r.assigneeId) t.unassigned++;
  }
  return t;
}

/**
 * Department → team → person, with counts, for whoever may see those
 * departments (the CEO: all; a head: theirs; anyone else: their own).
 */
export async function departmentBreakdown(actor: Actor, scope: Scope, now = new Date()): Promise<DepartmentTally[]> {
  const dayStart = istDayRange(istDayKey(now)).start;
  const departments = await prisma.department.findMany({
    where: scope.all ? {} : { id: { in: [...scope.departmentIds] } },
    orderBy: { orderKey: "asc" },
    select: { id: true, name: true, color: true, hodId: true, hod: { select: { name: true } }, groups: { where: { active: true }, orderBy: { orderKey: "asc" }, select: { id: true, name: true, leadId: true, lead: { select: { name: true } }, members: { select: { user: { select: { id: true, name: true } } } } } } },
  });
  if (departments.length === 0) return [];
  const rows = await prisma.task.findMany({
    where: { AND: [LIVE, { departmentId: { in: departments.map((d) => d.id) } }, { state: { in: [...OPEN_STATES] } }] },
    select: { departmentId: true, assignmentGroupId: true, assigneeId: true, state: true, dueDate: true, assignee: { select: { name: true } } },
  });
  return departments.map((d) => {
    const mine = rows.filter((r) => r.departmentId === d.id);
    const teams: TeamTally[] = d.groups.map((g) => {
      const theirs = mine.filter((r) => r.assignmentGroupId === g.id);
      const people = new Map<string, PersonTally>();
      for (const m of g.members) people.set(m.user.id, { id: m.user.id, name: m.user.name, open: 0, inProgress: 0, waiting: 0, overdue: 0, unassigned: 0 });
      if (g.leadId && g.lead && !people.has(g.leadId)) people.set(g.leadId, { id: g.leadId, name: g.lead.name, open: 0, inProgress: 0, waiting: 0, overdue: 0, unassigned: 0 });
      for (const r of theirs) {
        if (!r.assigneeId) continue;
        const p = people.get(r.assigneeId) ?? { id: r.assigneeId, name: r.assignee?.name ?? "Someone", open: 0, inProgress: 0, waiting: 0, overdue: 0, unassigned: 0 };
        Object.assign(p, tallyOf([...theirs.filter((x) => x.assigneeId === r.assigneeId)], dayStart));
        people.set(r.assigneeId, p);
      }
      return { id: g.id, name: g.name, leadId: g.leadId, leadName: g.lead?.name ?? null, ...tallyOf(theirs, dayStart), people: [...people.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)) };
    });
    return {
      id: d.id,
      name: d.name,
      color: d.color,
      hodId: d.hodId,
      hodName: d.hod?.name ?? null,
      ...tallyOf(mine, dayStart),
      teams,
      unteamed: tallyOf(mine.filter((r) => !r.assignmentGroupId), dayStart),
    };
  });
}

/** Parse the query string of GET /api/work and its presets. */
export function parseFilter(params: URLSearchParams): WorkFilter {
  const list = <T extends string>(key: string, allowed: readonly T[]): T[] | undefined => {
    const raw = params.getAll(key).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
    const ok = raw.filter((v): v is T => (allowed as readonly string[]).includes(v));
    return ok.length ? ok : undefined;
  };
  const str = (key: string) => params.get(key)?.trim() || undefined;
  const bool = (key: string) => params.get(key) === "1" || params.get(key) === "true";
  const open = str("open");
  const mine = str("mine");
  const sort = str("sort");
  return {
    q: str("q"),
    state: list("state", ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED", "CANCELLED", "ESCALATED", "REOPENED"] as const),
    priority: list("priority", ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const),
    type: list("type", ["GENERAL", "ISSUE", "REQUEST", "PROJECT_TASK", "APPROVAL", "SUPPORT"] as const),
    departmentId: str("departmentId"),
    assignmentGroupId: str("assignmentGroupId"),
    assigneeId: str("assigneeId"),
    requesterId: str("requesterId"),
    projectId: str("projectId"),
    milestoneId: str("milestoneId"),
    unassigned: bool("unassigned"),
    overdue: bool("overdue"),
    dueFrom: str("dueFrom"),
    dueTo: str("dueTo"),
    createdFrom: str("createdFrom"),
    createdTo: str("createdTo"),
    mine: mine === "assigned" || mine === "requested" || mine === "team" || mine === "department" ? mine : undefined,
    // A search or an explicit state looks at everything; a plain list is open work.
    open: open === "false" || open === "finished" ? open : open === "true" ? "true" : params.get("state") || params.get("q") ? "false" : "true",
    sort: sort === "due" || sort === "priority" || sort === "created" || sort === "number" || sort === "updated" ? sort : undefined,
    cursor: str("cursor"),
    limit: params.get("limit") ? Number(params.get("limit")) : undefined,
  };
}
