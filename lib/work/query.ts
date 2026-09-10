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
  /** A project's id, or "none" for the work that sits in no project. */
  projectId?: string;
  milestoneId?: string;
  unassigned?: boolean;
  /** Tasks with a meeting ahead, today included (owner, 2026-09-11). */
  meeting?: boolean;
  overdue?: boolean;
  dueToday?: boolean;
  dueFrom?: string;
  dueTo?: string;
  createdFrom?: string;
  createdTo?: string;
  /** Shortcuts for the four tabs. */
  mine?: "assigned" | "requested" | "team" | "department" | "individual";
  /** Default true: open work only. `false` = everything, `finished` = the other half. */
  open?: "true" | "false" | "finished";
  /** "meeting": the soonest meeting first, tasks with none after. */
  sort?: "updated" | "due" | "priority" | "created" | "number" | "meeting";
  /**
   * "tasks": one row per TASK. The same task given to several people is one
   * record each; listed this way it is shown, counted and paged once, and
   * pages are numbered instead of following a cursor (review, 2026-09-10).
   */
  rows?: "tasks";
  /** With rows=tasks: the page, from 1. */
  page?: number;
  cursor?: string;
  limit?: number;
};

const REF = /^([A-Z]+)0*(\d+)$/i;

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
  if (f.projectId) and.push({ projectId: f.projectId === "none" ? null : f.projectId });
  if (f.milestoneId) and.push({ milestoneId: f.milestoneId });
  if (f.unassigned) and.push({ assigneeId: null });
  // Meetings are stored as the UTC midnight of their day, so "today" is that too.
  if (f.meeting) and.push({ meetings: { some: { isMeeting: true, date: { gte: new Date(`${istDayKey(now)}T00:00:00.000Z`) } } } });
  if (f.overdue) and.push({ dueDate: { lt: istDayRange(istDayKey(now)).start }, state: { in: [...OPEN_STATES] } });
  if (f.dueToday) {
    const day = istDayRange(istDayKey(now));
    and.push({ dueDate: { gte: day.start, lte: day.end } });
  }
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
    // Extra work given straight to a person, in no department (owner, 2026-09-11).
    case "individual":
      and.push({ departmentId: null, assigneeId: { not: null } });
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

/** Names for what a list is narrowed to, so the screen can say it in words. */
export type WorkLabels = { department: string | null; team: string | null; assignee: string | null; requester: string | null; project: string | null };
export type WorkListDTO = { items: TaskDTO[]; nextCursor: string | null; total: number; page?: number; pageSize?: number; labels?: WorkLabels };

/**
 * Every order ends on the id, so two tasks touched in the same instant can
 * never swap or vanish at a page break. Priority is the enum's own order —
 * Critical, High, Medium, Low — then the soonest due (owner, 2026-09-10).
 */
function orderFor(sort: WorkFilter["sort"]): Prisma.TaskOrderByWithRelationInput[] {
  // "meeting" is ordered after the read (listWorkTasks); the due date is its base.
  if (sort === "due" || sort === "meeting") return [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "desc" }, { id: "desc" }];
  if (sort === "created") return [{ createdAt: "desc" }, { id: "desc" }];
  if (sort === "number") return [{ number: "desc" }, { id: "desc" }];
  if (sort === "priority") return [{ priority: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { id: "desc" }];
  return [{ updatedAt: "desc" }, { id: "desc" }];
}

/** A whole number within bounds; anything unreadable falls back. */
function wholeNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), min), max) : fallback;
}

function findListed(args: Omit<Prisma.TaskFindManyArgs, "include" | "select">) {
  return prisma.task.findMany({ ...args, include: TASK_INCLUDE });
}
type ListedRow = Awaited<ReturnType<typeof findListed>>[number];

/** The soonest meeting ahead on each of these tasks, today included (owner, 2026-09-11). */
export async function nextMeetings(taskIds: string[], now = new Date()): Promise<Map<string, NonNullable<TaskDTO["nextMeeting"]>>> {
  const out = new Map<string, NonNullable<TaskDTO["nextMeeting"]>>();
  if (!taskIds.length) return out;
  const events = await prisma.calendarEvent.findMany({
    where: { taskId: { in: taskIds }, isMeeting: true, date: { gte: new Date(`${istDayKey(now)}T00:00:00.000Z`) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { taskId: true, date: true, startTime: true, title: true },
  });
  for (const e of events) {
    if (e.taskId && !out.has(e.taskId)) out.set(e.taskId, { date: e.date.toISOString(), startTime: e.startTime, title: e.title });
  }
  return out;
}

/** Records as the list shows them: their note counts, and who else holds each shared task. */
async function present(page: ListedRow[]): Promise<TaskDTO[]> {
  const [counts, upcoming] = await Promise.all([noteCounts(page.map((r) => r.id), true), nextMeetings(page.map((r) => r.id))]);

  // The same task given to several people is one record each. Who ELSE holds it
  // is answered here, in one query for the whole page, so a row can say so
  // without the screen guessing from titles and without the others having to
  // land on the same page of results.
  const keys = [...new Set(page.map((r) => r.siblingKey).filter((k): k is string => Boolean(k)))];
  const crew = new Map<string, { id: string; name: string }[]>();
  if (keys.length) {
    const siblings = await prisma.task.findMany({
      where: { siblingKey: { in: keys }, deletedAt: null, assigneeId: { not: null } },
      select: { siblingKey: true, assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    for (const s of siblings) {
      if (!s.siblingKey || !s.assignee) continue;
      const list = crew.get(s.siblingKey) ?? [];
      // One entry per person, however many records they hold.
      if (!list.some((p) => p.id === s.assignee!.id)) list.push(s.assignee);
      crew.set(s.siblingKey, list);
    }
  }

  return withCounts(page, counts).map((row) => {
    const dto = serializeTask(row);
    const all = row.siblingKey ? crew.get(row.siblingKey) ?? [] : [];
    return { ...dto, alsoWith: all.filter((p) => p.id !== row.assigneeId), nextMeeting: upcoming.get(row.id) ?? null };
  });
}

/** Records, a cursor at a time: what every API caller gets unless it asks for rows=tasks. */
export async function listWork(actor: Actor, scope: Scope, f: WorkFilter): Promise<WorkListDTO> {
  const where = filterWhere(actor, scope, f);
  const limit = wholeNumber(f.limit, 1, 200, 50);
  const [rows, total] = await Promise.all([
    findListed({ where, orderBy: orderFor(f.sort), take: limit + 1, ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}) }),
    prisma.task.count({ where }),
  ]);
  const page = rows.slice(0, limit);
  return { items: await present(page), nextCursor: rows.length > limit ? page[page.length - 1].id : null, total };
}

/**
 * The list as the Work screen shows it: one row per task. A shared task is
 * shown by whichever of its records comes first in the chosen order and
 * matches, counted once, and never split across two pages. The footer used to
 * count records and pages could repeat or skip a shared task (review, 2026-09-10).
 */
export async function listWorkTasks(actor: Actor, scope: Scope, f: WorkFilter): Promise<WorkListDTO> {
  const where = filterWhere(actor, scope, f);
  const pageSize = wholeNumber(f.limit, 1, 200, 50);
  const page = wholeNumber(f.page, 1, 100_000, 1);
  // Every matching record's id and shared key, in order: short rows, and the
  // only exact way to count and page tasks rather than records.
  const ordered = await prisma.task.findMany({ where, orderBy: orderFor(f.sort), select: { id: true, siblingKey: true } });
  const firsts: string[] = [];
  const seen = new Set<string>();
  for (const r of ordered) {
    const key = r.siblingKey ?? `id:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    firsts.push(r.id);
  }
  // Soonest meeting first; tasks with none keep their order after them.
  if (f.sort === "meeting" && firsts.length) {
    const next = await nextMeetings(firsts);
    const at = (id: string) => {
      const m = next.get(id);
      return m ? `${m.date}|${m.startTime ?? "99:99"}` : null;
    };
    const place = new Map(firsts.map((id, i) => [id, i] as const));
    firsts.sort((a, b) => {
      const ka = at(a);
      const kb = at(b);
      if (ka && kb) return ka < kb ? -1 : ka > kb ? 1 : place.get(a)! - place.get(b)!;
      if (ka || kb) return ka ? -1 : 1;
      return place.get(a)! - place.get(b)!;
    });
  }
  const ids = firsts.slice((page - 1) * pageSize, page * pageSize);
  const rows = ids.length ? await findListed({ where: { id: { in: ids } } }) : [];
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const inOrder = ids.map((id) => byId.get(id)).filter((r): r is ListedRow => Boolean(r));
  return { items: await present(inOrder), nextCursor: null, total: firsts.length, page, pageSize };
}

/** How many TASKS match: a task given to several people is several records, counted once. */
export async function countTasks(where: Prisma.TaskWhereInput): Promise<number> {
  const [alone, shared] = await Promise.all([
    prisma.task.count({ where: { AND: [where, { siblingKey: null }] } }),
    prisma.task.findMany({ where: { AND: [where, { siblingKey: { not: null } }] }, distinct: ["siblingKey"], select: { siblingKey: true } }),
  ]);
  return alone + shared.length;
}

/** Names for the department, team, people and project a list is narrowed to. */
export async function narrowingLabels(scope: Scope, f: WorkFilter): Promise<WorkLabels> {
  const person = (id: string | undefined) => (id ? prisma.user.findUnique({ where: { id }, select: { name: true } }) : null);
  // A project's name only for someone who may see the project.
  const projectShown = Boolean(f.projectId && f.projectId !== "none" && (scope.projectIds === null || scope.projectIds.has(f.projectId)));
  const [department, team, assignee, requester, project] = await Promise.all([
    f.departmentId ? prisma.department.findUnique({ where: { id: f.departmentId }, select: { name: true } }) : null,
    f.assignmentGroupId ? prisma.assignmentGroup.findUnique({ where: { id: f.assignmentGroupId }, select: { name: true } }) : null,
    person(f.assigneeId),
    person(f.requesterId),
    projectShown ? prisma.project.findUnique({ where: { id: f.projectId! }, select: { name: true } }) : null,
  ]);
  return { department: department?.name ?? null, team: team?.name ?? null, assignee: assignee?.name ?? null, requester: requester?.name ?? null, project: project?.name ?? null };
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
    meeting: bool("meeting"),
    overdue: bool("overdue"),
    dueToday: bool("dueToday"),
    dueFrom: str("dueFrom"),
    dueTo: str("dueTo"),
    createdFrom: str("createdFrom"),
    createdTo: str("createdTo"),
    mine: mine === "assigned" || mine === "requested" || mine === "team" || mine === "department" || mine === "individual" ? mine : undefined,
    // A search or an explicit state looks at everything; a plain list is open
    // work. The Work screen always says which it means, so its search keeps Show.
    open: open === "false" || open === "finished" ? open : open === "true" ? "true" : params.get("state") || params.get("q") ? "false" : "true",
    sort: sort === "due" || sort === "priority" || sort === "created" || sort === "number" || sort === "updated" || sort === "meeting" ? sort : undefined,
    rows: str("rows") === "tasks" ? "tasks" : undefined,
    page: params.get("page") ? Number(params.get("page")) : undefined,
    cursor: str("cursor"),
    limit: params.get("limit") ? Number(params.get("limit")) : undefined,
  };
}
