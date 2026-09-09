/**
 * The task service (work model, 2026-09-09). Every write to a task comes
 * through here: the routes are thin. Each write runs in one transaction,
 * records what changed in the activity stream, and only then tells the
 * event layer — so a refused save leaves nothing behind and a saved one is
 * never silent.
 */
import type { Prisma, ResolutionCode, Task, User, WaitingReason, WorkPriority, WorkState, WorkType } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { isLeadOrAboveRole } from "@/lib/roles";
import { isOnProject } from "@/lib/project-people";
import { syncProjectReviews } from "@/lib/meetings";
import { TASK_INCLUDE, withCounts, type TaskRow } from "@/lib/serialize";
import type { TaskStatus } from "@/lib/types";
import {
  canAssignTask,
  canDeleteTask,
  canEditTask,
  canSeeTask,
  canTransitionTask,
  isStaffOnTask,
  loadAccessRow,
  loadScope,
  notFound,
  taskAccess,
  type Actor,
  type Scope,
  type TaskAccessDTO,
  type TaskAccessRow,
} from "@/lib/work/access";
import { noteCounts, recordChanges, recordSystem, type ActivityRow, type Tx } from "@/lib/work/activity";
import { assertAssigneeAllowed, routeWork } from "@/lib/work/assignment";
import { emit, type EventTask } from "@/lib/work/events";
import { canTransition, pathToStatus, stateAfterAssignment, statusOf, transitionNeeds } from "@/lib/work/workflow";

type ActorUser = Pick<User, "id" | "role" | "name">;

/** A short description reads "Fix The Login Page": the first letter, and every letter after a space, in capitals (developer, 2026-09-09). */
export function titleCase(s: string): string {
  return s.replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
}

/* ------------------------------------------------------------------ reads */

/** A task with its people joined and its step/note counts filled. */
export async function loadTaskRow(id: string, staff: boolean): Promise<TaskRow | null> {
  const task = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  if (!task) return null;
  const [steps, notes] = await Promise.all([
    prisma.task.findMany({ where: { parentId: id, deletedAt: null }, select: { id: true, parentId: true, status: true, deletedAt: true } }),
    noteCounts([id], staff),
  ]);
  const [row] = withCounts([task, ...steps.map((s) => ({ ...task, ...s }))], notes);
  return row;
}

/** The record page's read: the row plus what THIS actor may do to it. */
export async function loadWork(actor: ActorUser, id: string): Promise<{ row: TaskRow; access: TaskAccessDTO }> {
  const scope = await loadScope(actor);
  const acc = await loadAccessRow(id);
  if (!acc || acc.task.deletedAt || !(await canSeeTask(actor, acc.root, scope))) notFound();
  const [access, staff] = await Promise.all([taskAccess(actor, acc.root, scope), isStaffOnTask(actor, acc.root, scope)]);
  const row = await loadTaskRow(id, staff);
  if (!row) notFound();
  return { row, access };
}

/** May the actor read this task? (404 otherwise, like every task route.) */
export async function requireSee(actor: ActorUser, id: string): Promise<{ scope: Scope; task: TaskAccessRow; root: TaskAccessRow }> {
  const scope = await loadScope(actor);
  const acc = await loadAccessRow(id);
  if (!acc || !(await canSeeTask(actor, acc.root, scope))) notFound();
  return { scope, task: acc.task, root: acc.root };
}

/* ---------------------------------------------------------------- helpers */

const TRACK = ["title", "state", "priority", "type", "assigneeId", "assignmentGroupId", "departmentId", "requesterId", "categoryId", "dueDate", "milestoneId", "projectId", "parentId", "waitingReason", "resolutionCode", "archived", "important", "deletedAt"] as const;
type Tracked = (typeof TRACK)[number];
function snapshot(t: Partial<Task>): Partial<Pick<Task, Tracked>> {
  const out: Record<string, unknown> = {};
  for (const k of TRACK) if (k in t) out[k] = t[k];
  return out as Partial<Pick<Task, Tracked>>;
}

function toEventTask(t: Task): EventTask {
  return {
    id: t.id,
    number: t.number,
    type: t.type,
    title: t.title,
    state: t.state,
    priority: t.priority,
    dueDate: t.dueDate,
    assigneeId: t.assigneeId,
    requesterId: t.requesterId,
    givenById: t.givenById,
    assignmentGroupId: t.assignmentGroupId,
    departmentId: t.departmentId,
    projectId: t.projectId,
    waitingReason: t.waitingReason,
    resolutionCode: t.resolutionCode,
    resolutionNotes: t.resolutionNotes,
  };
}

function parseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "That is not a date.");
  return d;
}

/** `rootId` and everything beneath it, cycle-safe (a visited set; the old walk looped forever). */
export async function subtreeIds(tx: Tx | typeof prisma, scope: Prisma.TaskWhereInput, rootId: string, includeDeleted: boolean): Promise<string[]> {
  const rows = await tx.task.findMany({ where: { ...scope, ...(includeDeleted ? {} : { deletedAt: null }) }, select: { id: true, parentId: true } });
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = childrenOf.get(r.parentId);
    if (list) list.push(r.id);
    else childrenOf.set(r.parentId, [r.id]);
  }
  const seen = new Set<string>([rootId]);
  const out = [rootId];
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length) {
    const next = stack.pop() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    stack.push(...(childrenOf.get(next) ?? []));
  }
  return out;
}

function scopeOf(task: { isPrivate: boolean; ownerId: string | null; projectId: string | null; id: string }): Prisma.TaskWhereInput {
  if (task.isPrivate) return { ownerId: task.ownerId, isPrivate: true };
  if (task.projectId) return { projectId: task.projectId };
  // A standalone task's only relatives are its own steps — never every projectless row.
  return { OR: [{ id: task.id }, { parentId: task.id }] };
}

/** What a move writes besides the state itself. */
function transitionData(to: WorkState, actorId: string, now: Date, extra: TransitionExtra): Prisma.TaskUncheckedUpdateInput {
  const d: Prisma.TaskUncheckedUpdateInput = { state: to, status: statusOf(to) };
  switch (to) {
    case "IN_PROGRESS":
      d.waitingReason = null;
      d.waitingNote = null;
      break;
    case "ASSIGNED":
    case "NEW":
      d.waitingReason = null;
      d.waitingNote = null;
      break;
    case "WAITING":
      d.waitingReason = extra.waitingReason ?? "OTHER";
      d.waitingNote = extra.waitingNote ?? null;
      break;
    case "ESCALATED":
      d.escalatedAt = now;
      break;
    case "RESOLVED":
      d.resolutionCode = extra.resolutionCode ?? "COMPLETED";
      d.resolutionNotes = extra.resolutionNotes ?? null;
      d.rootCause = extra.rootCause ?? null;
      d.resolvedAt = now;
      d.resolvedById = actorId;
      d.completedAt = now;
      d.completedById = actorId;
      d.waitingReason = null;
      d.waitingNote = null;
      break;
    case "CLOSED":
      d.closedAt = now;
      d.closedById = actorId;
      break;
    case "CANCELLED":
      d.closedAt = now;
      d.closedById = actorId;
      d.archived = true;
      d.waitingReason = null;
      break;
    case "REOPENED":
      d.resolvedAt = null;
      d.resolvedById = null;
      d.closedAt = null;
      d.closedById = null;
      d.resolutionCode = null;
      d.completedAt = null;
      d.completedById = null;
      d.archived = false;
      break;
  }
  return d;
}

export type TransitionExtra = {
  waitingReason?: WaitingReason | null;
  waitingNote?: string | null;
  resolutionCode?: ResolutionCode | null;
  resolutionNotes?: string | null;
  rootCause?: string | null;
};

/* ---------------------------------------------------------------- create */

export type CreateWorkInput = {
  id?: string;
  title?: string;
  descriptionMd?: string;
  type?: WorkType;
  priority?: WorkPriority;
  categoryId?: string | null;
  requesterId?: string | null;
  departmentId?: string | null;
  assignmentGroupId?: string | null;
  assigneeId?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  dueProvisional?: boolean;
  important?: boolean;
  orderKey?: string;
  /** Shared by the records raised together when one task goes to several people. */
  siblingKey?: string;
  /** The old screens' four words; translated into moves after the row exists. */
  status?: TaskStatus;
};

export async function createWork(actor: ActorUser, input: CreateWorkInput): Promise<TaskRow> {
  const scope = await loadScope(actor);
  const projectId = input.projectId ?? null;

  let project: { id: string; name: string; slug: string; departmentId: string | null } | null = null;
  if (projectId) {
    if (scope.projectIds && !scope.projectIds.has(projectId)) throw new HttpError(404, "Project not found");
    project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, slug: true, departmentId: true } });
    if (!project) throw new HttpError(404, "Project not found");
    // Adding anything to a project — a task or a step — means being on it (or running it).
    const onIt = scope.all || isLeadOrAboveRole(actor.role) || (await isOnProject(actor.id, projectId)) || (project.departmentId ? scope.headedDepartmentIds.has(project.departmentId) : false);
    if (!onIt) throw new HttpError(403, "You're not on this project.");
  }

  // A step: one level deep, follows its task's box, date and team; holds no one.
  let parent: { id: string; parentId: string | null; projectId: string | null; milestoneId: string | null; dueDate: Date | null; dueProvisional: boolean; type: WorkType; departmentId: string | null; assignmentGroupId: string | null; requesterId: string | null } | null = null;
  if (input.parentId) {
    if (input.assigneeId) throw new HttpError(400, "A step belongs to its task's person");
    parent = await prisma.task.findFirst({
      where: { id: input.parentId, deletedAt: null, isPrivate: false, projectId },
      select: { id: true, parentId: true, projectId: true, milestoneId: true, dueDate: true, dueProvisional: true, type: true, departmentId: true, assignmentGroupId: true, requesterId: true },
    });
    if (!parent) throw new HttpError(400, "Parent not found");
    if (parent.parentId) {
      const root = await prisma.task.findUnique({ where: { id: parent.parentId }, select: { id: true, parentId: true, projectId: true, milestoneId: true, dueDate: true, dueProvisional: true, type: true, departmentId: true, assignmentGroupId: true, requesterId: true } });
      if (root) parent = root;
    }
    if (!projectId) {
      const acc = await loadAccessRow(parent.id);
      if (!acc || !(await canEditTask(actor, acc.root, scope))) throw new HttpError(403, "You can't add steps to this task.");
    }
  }

  let due = parseDate(input.dueDate);
  let guessed = input.dueProvisional === true;
  let milestoneId: string | null = input.milestoneId ?? null;
  if (parent) {
    milestoneId = parent.milestoneId;
    if (!due && parent.dueDate) { due = parent.dueDate; guessed = parent.dueProvisional; }
  } else if (milestoneId) {
    if (!projectId) throw new HttpError(400, "A milestone belongs to a project.");
    const m = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId }, select: { reviewDate: true } });
    if (!m) throw new HttpError(400, "Milestone not found");
    if (!due) { due = m.reviewDate; guessed = true; }
  }

  const type: WorkType = parent ? parent.type : (input.type ?? (projectId ? "PROJECT_TASK" : "GENERAL"));
  const priority: WorkPriority = input.priority ?? (input.important ? "HIGH" : "MEDIUM");
  const requesterId = parent ? parent.requesterId : (input.requesterId ?? actor.id);
  const me = scope.all ? null : await prisma.user.findUnique({ where: { id: actor.id }, select: { departmentId: true } });

  // Where it sits: given, else the project's department, else the team's, else the raiser's own.
  const routed = parent
    ? { type, categoryId: input.categoryId ?? null, departmentId: parent.departmentId, priority, assignmentGroupId: parent.assignmentGroupId, assigneeId: null, escalate: false, applied: [] as string[] }
    : await routeWork({
        type,
        categoryId: input.categoryId ?? null,
        departmentId: input.departmentId ?? project?.departmentId ?? null,
        priority,
        assignmentGroupId: input.assignmentGroupId ?? null,
        assigneeId: input.assigneeId ?? null,
      });
  if (!routed.departmentId) routed.departmentId = me?.departmentId ?? null;

  // On a project, a task given with no one named lands on the giver (the old
  // contract, kept); a task on its own stays unheld and goes to its team.
  const assigneeId = parent ? null : (routed.assigneeId ?? (input.assigneeId === undefined && projectId ? actor.id : null));
  const check = await assertAssigneeAllowed(prisma, actor, scope, { projectId, departmentId: routed.departmentId }, routed.assignmentGroupId, assigneeId);
  if (assigneeId) {
    // Naming a holder is assigning: the same door as a later reassignment.
    const draft: TaskAccessRow = { id: "", isPrivate: false, ownerId: null, projectId, departmentId: routed.departmentId, assignmentGroupId: routed.assignmentGroupId, assigneeId: null, requesterId, givenById: actor.id, parentId: null, type, state: "NEW", deletedAt: null };
    if (!(await canAssignTask(actor, draft, scope)) && assigneeId !== actor.id) throw new HttpError(403, "You can't give this to someone else.");
  }

  let orderKey = input.orderKey;
  if (!orderKey) {
    const last = await prisma.task.findFirst({
      where: projectId ? { projectId, parentId: parent?.id ?? null, deletedAt: null } : { isPrivate: false, projectId: null, parentId: parent?.id ?? null, deletedAt: null },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    orderKey = generateKeyBetween(last?.orderKey ?? null, null);
  }

  const now = new Date();
  const state: WorkState = assigneeId ? "ASSIGNED" : "NEW";
  const created = await prisma.$transaction(async (tx) => {
    const t = await tx.task.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        projectId,
        parentId: parent?.id ?? null,
        milestoneId,
        title: titleCase(input.title ?? ""),
        descriptionMd: input.descriptionMd ?? "",
        orderKey: orderKey!,
        status: statusOf(state),
        state,
        type,
        priority: routed.priority,
        important: input.important ?? (routed.priority === "HIGH" || routed.priority === "CRITICAL"),
        categoryId: routed.categoryId,
        requesterId,
        departmentId: routed.departmentId,
        assignmentGroupId: routed.assignmentGroupId,
        assigneeId,
        assignedAt: assigneeId ? now : null,
        // "Given by" is the act of handing it to someone; raising a task for
        // yourself or your team is not giving (it would make the requester its
        // assigner).
        givenById: assigneeId ? actor.id : null,
        dueDate: due,
        dueProvisional: due ? guessed : false,
        siblingKey: input.siblingKey ?? null,
        ...(routed.escalate ? { escalatedAt: now } : {}),
      },
    });
    await recordSystem(tx, t.id, parent ? "Added as a step" : "Opened", { via: parent ? "step" : "create" }, actor.id);
    for (const line of routed.applied) await recordSystem(tx, t.id, line, { routing: true });
    let handover: ActivityRow | null = null;
    if (assigneeId) {
      const [row] = await recordChanges(tx, t.id, { assigneeId: null }, { assigneeId }, actor.id);
      handover = row ?? null;
    }
    if (check.addToProject && projectId && assigneeId) await tx.projectMember.upsert({ where: { projectId_userId: { projectId, userId: assigneeId } }, update: {}, create: { projectId, userId: assigneeId } });
    return { t, handover };
  });

  await emit({ type: "TASK_CREATED", task: toEventTask(created.t), actor: { id: actor.id, name: actor.name }, activityId: created.t.id });
  if (assigneeId && created.handover && (input.title ?? "").trim().length > 0) {
    await emit({ type: "TASK_ASSIGNED", task: toEventTask(created.t), actor: { id: actor.id, name: actor.name }, activityId: created.handover.id });
  }

  // The old screens may open a task already Done (a tick from quick-add).
  let row = created.t;
  if (input.status && statusOf(row.state) !== input.status) {
    row = await applyLegacyStatus(actor, row, input.status, scope);
  }
  if (assigneeId && projectId && milestoneId) await reviewsSafely(projectId, actor.id);

  const out = await loadTaskRow(row.id, true);
  return out!;
}

/* ---------------------------------------------------------------- update */

export type UpdateWorkInput = Partial<{
  title: string;
  descriptionMd: string;
  type: WorkType;
  priority: WorkPriority;
  categoryId: string | null;
  requesterId: string | null;
  departmentId: string | null;
  assignmentGroupId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  milestoneId: string | null;
  parentId: string | null;
  orderKey: string;
  important: boolean;
  archived: boolean;
  deliverableUrl: string | null;
  deletedAt: null;
  status: TaskStatus;
}>;

export async function updateWork(actor: ActorUser, id: string, patch: UpdateWorkInput): Promise<TaskRow> {
  const scope = await loadScope(actor);
  const existing = await prisma.task.findUnique({ where: { id }, include: { project: { select: { id: true, name: true, slug: true } } } });
  if (!existing) notFound();
  const acc = await loadAccessRow(id);
  if (!acc || !(await canSeeTask(actor, acc.root, scope))) notFound();
  const root = acc.root;

  // Undo: bring back this task and everything that went down with it.
  if (patch.deletedAt === null && existing.deletedAt) {
    if (!(await canDeleteTask(actor, root, scope))) throw new HttpError(403, "You can't bring this back.");
    const stamp = existing.deletedAt;
    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { ...scopeOf(existing), deletedAt: stamp }, data: { deletedAt: null } });
      await recordChanges(tx, id, { deletedAt: stamp }, { deletedAt: null }, actor.id);
    });
    return (await loadTaskRow(id, true))!;
  }
  if (existing.deletedAt) throw new HttpError(409, "Task is deleted");

  const editing = ["title", "descriptionMd", "type", "priority", "categoryId", "requesterId", "departmentId", "dueDate", "milestoneId", "parentId", "orderKey", "important", "archived", "deliverableUrl"].some((k) => k in patch);
  const assigning = "assigneeId" in patch || "assignmentGroupId" in patch;
  const [mayEdit, mayAssign] = await Promise.all([editing ? canEditTask(actor, root, scope) : true, assigning ? canAssignTask(actor, root, scope) : true]);
  if (!mayEdit) throw new HttpError(403, "You can't change this task.");
  if (!mayAssign) throw new HttpError(403, "You can't change who holds this.");

  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (patch.title !== undefined) data.title = titleCase(patch.title);
  if (patch.descriptionMd !== undefined) data.descriptionMd = patch.descriptionMd;
  if (patch.orderKey !== undefined) data.orderKey = patch.orderKey;
  if (patch.deliverableUrl !== undefined) data.deliverableUrl = patch.deliverableUrl;
  if (patch.archived !== undefined) data.archived = patch.archived;
  if (patch.type !== undefined && !existing.isPrivate) data.type = patch.type;
  if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
  if (patch.requesterId !== undefined) data.requesterId = patch.requesterId;
  if (patch.departmentId !== undefined) data.departmentId = patch.departmentId;
  if (patch.dueDate !== undefined) {
    data.dueProvisional = false;
    data.dueDate = parseDate(patch.dueDate);
  }
  // The star and the priority are one axis seen two ways.
  if (patch.priority !== undefined) {
    data.priority = patch.priority;
    data.important = patch.priority === "HIGH" || patch.priority === "CRITICAL";
  } else if (patch.important !== undefined) {
    data.important = patch.important;
    if (patch.important && (existing.priority === "MEDIUM" || existing.priority === "LOW")) data.priority = "HIGH";
    if (!patch.important && (existing.priority === "HIGH" || existing.priority === "CRITICAL")) data.priority = "MEDIUM";
  }

  if (patch.milestoneId !== undefined) {
    if (existing.isPrivate || existing.parentId !== null) throw new HttpError(400, "Only a task (not a step) sits in a milestone");
    if (patch.milestoneId === null) data.milestoneId = null;
    else {
      if (!existing.projectId) throw new HttpError(400, "A milestone belongs to a project.");
      const m = await prisma.milestone.findFirst({ where: { id: patch.milestoneId, projectId: existing.projectId }, select: { id: true } });
      if (!m) throw new HttpError(400, "Milestone not found");
      data.milestoneId = m.id;
    }
  }

  // Who holds it, and which team.
  let nextGroup = existing.assignmentGroupId;
  let nextAssignee = existing.assigneeId;
  let addToProject = false;
  if (patch.assignmentGroupId !== undefined) {
    if (existing.isPrivate) throw new HttpError(400, "Private tasks have no team");
    nextGroup = patch.assignmentGroupId;
    if (nextGroup) {
      const g = await prisma.assignmentGroup.findUnique({ where: { id: nextGroup }, select: { id: true, departmentId: true } });
      if (!g) throw new HttpError(400, "That team does not exist.");
      if (patch.departmentId === undefined && !existing.departmentId) data.departmentId = g.departmentId;
    }
    data.assignmentGroupId = nextGroup;
  }
  if (patch.assigneeId !== undefined) {
    if (existing.isPrivate) throw new HttpError(400, "Private tasks aren't assignable");
    if (existing.parentId !== null) throw new HttpError(400, "A step belongs to its task's person");
    nextAssignee = patch.assigneeId;
  }
  if (assigning) {
    if (nextAssignee && nextAssignee !== existing.assigneeId) {
      const check = await assertAssigneeAllowed(prisma, actor, scope, { projectId: existing.projectId, departmentId: (data.departmentId as string | null | undefined) ?? existing.departmentId }, nextGroup, nextAssignee);
      addToProject = check.addToProject;
    } else if (nextAssignee && nextGroup && nextGroup !== existing.assignmentGroupId) {
      // A new team the holder is not on: the task goes to the team, unheld.
      try {
        await assertAssigneeAllowed(prisma, actor, scope, { projectId: existing.projectId, departmentId: existing.departmentId }, nextGroup, nextAssignee);
      } catch {
        nextAssignee = null;
      }
    }
    data.assigneeId = nextAssignee;
    // The date the list shows: stamped when it lands in somebody's hands, and
    // cleared when it leaves them.
    if (nextAssignee !== existing.assigneeId) data.assignedAt = nextAssignee ? new Date() : null;
    if (nextAssignee && nextAssignee !== existing.assigneeId) data.givenById = actor.id;
    if (existing.parentId === null) {
      const s = stateAfterAssignment(existing.state, Boolean(nextAssignee));
      if (s !== existing.state) { data.state = s; data.status = statusOf(s); }
    }
  }

  // A task becoming a step, or a step moving: one level deep, no holder.
  if (patch.parentId !== undefined) {
    if (patch.parentId === id) throw new HttpError(400, "A task cannot be its own step");
    if (patch.parentId === null) {
      data.parentId = null;
    } else {
      const parent = await prisma.task.findFirst({ where: { id: patch.parentId, ...scopeOf(existing), deletedAt: null }, select: { id: true, parentId: true, milestoneId: true } });
      if (!parent) throw new HttpError(400, "Parent not found");
      const subtree = await subtreeIds(prisma, scopeOf(existing), id, false);
      if (subtree.includes(patch.parentId)) throw new HttpError(400, "Cannot move a task inside its own steps");
      const target = existing.isPrivate ? parent.id : (parent.parentId ?? parent.id);
      data.parentId = target;
      if (!existing.isPrivate) {
        if (existing.assigneeId && !(await canAssignTask(actor, root, scope))) throw new HttpError(403, "You can't change who holds this.");
        data.assigneeId = null;
        data.assignedAt = null;
        nextAssignee = null;
        data.milestoneId = parent.milestoneId;
      }
    }
  }

  const changed = await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data });
    if (!existing.isPrivate && existing.parentId === null && patch.milestoneId !== undefined) {
      await tx.task.updateMany({ where: { parentId: id }, data: { milestoneId: patch.milestoneId } });
    }
    if (patch.archived !== undefined && existing.parentId === null) {
      await tx.task.updateMany({ where: { parentId: id }, data: { archived: patch.archived } });
    }
    if (data.assignmentGroupId !== undefined || data.departmentId !== undefined) {
      await tx.task.updateMany({ where: { parentId: id }, data: { ...(data.assignmentGroupId !== undefined ? { assignmentGroupId: data.assignmentGroupId as string | null } : {}), ...(data.departmentId !== undefined ? { departmentId: data.departmentId as string | null } : {}) } });
    }
    if (addToProject && existing.projectId && nextAssignee) {
      await tx.projectMember.upsert({ where: { projectId_userId: { projectId: existing.projectId, userId: nextAssignee } }, update: {}, create: { projectId: existing.projectId, userId: nextAssignee } });
    }
    const after = { ...existing, ...(data as Partial<Task>) } as Task;
    const rows = await recordChanges(tx, id, snapshot(existing), snapshot(after), actor.id);
    return { after, rows };
  });

  const actorInfo = { id: actor.id, name: actor.name };
  const fresh = await prisma.task.findUnique({ where: { id } });
  if (fresh) {
    const assigneeRow = changed.rows.find((r) => (r.metadata as { field?: string }).field === "assigneeId");
    if (assigneeRow) {
      const type = !fresh.assigneeId ? "TASK_UNASSIGNED" : existing.assigneeId ? "TASK_REASSIGNED" : "TASK_ASSIGNED";
      if (fresh.title.trim().length > 0 || type === "TASK_UNASSIGNED") {
        await emit({ type, task: toEventTask(fresh), actor: actorInfo, activityId: assigneeRow.id, payload: { previousAssigneeId: existing.assigneeId } });
      }
    }
    const priorityRow = changed.rows.find((r) => (r.metadata as { field?: string }).field === "priority");
    if (priorityRow) await emit({ type: "PRIORITY_CHANGED", task: toEventTask(fresh), actor: actorInfo, activityId: priorityRow.id, payload: { previousPriority: existing.priority } });
  }

  // The old screens' status word, translated into moves.
  let row = fresh ?? existing;
  if (patch.status !== undefined && fresh && statusOf(fresh.state) !== patch.status) {
    row = await applyLegacyStatus(actor, fresh, patch.status, scope);
  }

  if (existing.projectId && (assigning || patch.milestoneId !== undefined || patch.archived !== undefined || patch.parentId !== undefined)) {
    await reviewsSafely(existing.projectId, actor.id);
  }
  return (await loadTaskRow(row.id, true))!;
}

/* ------------------------------------------------------------ transitions */

/**
 * Move a task. The machine says whether the move exists; access says whether
 * this actor may make it; `transitionNeeds` says what it must carry.
 */
export async function transitionWork(actor: ActorUser, id: string, to: WorkState, extra: TransitionExtra & { note?: string | null } = {}): Promise<TaskRow> {
  const scope = await loadScope(actor);
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) notFound();
  const acc = await loadAccessRow(id);
  if (!acc || !(await canSeeTask(actor, acc.root, scope))) notFound();
  const row = await moveOnce(actor, existing, to, extra, scope, acc.root, acc.task.parentId !== null);
  if (extra.note && extra.note.trim()) {
    const { addNote } = await import("@/lib/work/activity");
    await addNote(id, actor.id, { body: extra.note.trim(), internal: false });
  }
  return (await loadTaskRow(row.id, true))!;
}

async function moveOnce(actor: ActorUser, existing: Task, to: WorkState, extra: TransitionExtra, scope: Scope, root: TaskAccessRow, isStep: boolean): Promise<Task> {
  if (!canTransition(existing.state, to)) {
    throw new HttpError(409, `Can't go from ${existing.state.toLowerCase().replace("_", " ")} to ${to.toLowerCase().replace("_", " ")}.`);
  }
  // A step follows its task's people: anyone who may edit the task may tick a step.
  const allowed = isStep ? await canEditTask(actor, root, scope) : await canTransitionTask(actor, { ...root, state: existing.state }, to, scope);
  if (!allowed) {
    if (to === "RESOLVED" && existing.type === "PROJECT_TASK") throw new HttpError(403, "Only a team lead or above marks a task done.");
    throw new HttpError(403, "You can't make that change.");
  }
  const needs = transitionNeeds(to);
  if (needs.waitingReason && !extra.waitingReason) throw new HttpError(400, "Say what it is waiting for.");
  const now = new Date();
  const data = transitionData(to, actor.id, now, extra);
  // Starting an unheld task takes it.
  if (to === "IN_PROGRESS" && !existing.assigneeId && !isStep) {
    await assertAssigneeAllowed(prisma, actor, scope, { projectId: existing.projectId, departmentId: existing.departmentId }, existing.assignmentGroupId, actor.id);
    data.assigneeId = actor.id;
    data.givenById = actor.id;
  }
  // Returning it to the queue lets go of it: nobody holds it until someone takes it again.
  if (to === "NEW" && existing.assigneeId && !isStep) {
    data.assigneeId = null;
  }
  const result = await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: existing.id }, data });
    const after = { ...existing, ...(data as Partial<Task>) } as Task;
    const rows = await recordChanges(tx, existing.id, snapshot(existing), snapshot(after), actor.id, extra.resolutionNotes ? { note: extra.resolutionNotes } : {});
    if (to === "RESOLVED" && (extra.resolutionNotes || extra.rootCause)) {
      await recordSystem(tx, existing.id, [extra.resolutionNotes, extra.rootCause ? `Root cause: ${extra.rootCause}` : null].filter(Boolean).join("\n"), { resolution: true }, actor.id);
    }
    if (to === "WAITING" && extra.waitingNote) await recordSystem(tx, existing.id, extra.waitingNote, { waiting: true }, actor.id);
    return { after, rows };
  });
  const fresh = (await prisma.task.findUnique({ where: { id: existing.id } })) ?? result.after;
  const stateRow = result.rows.find((r) => (r.metadata as { field?: string }).field === "state");
  if (!isStep) {
    await emit({ type: "STATUS_CHANGED", task: toEventTask(fresh), actor: { id: actor.id, name: actor.name }, activityId: stateRow?.id ?? `${existing.id}:${to}`, payload: { from: existing.state, to } });
    const assigneeRow = result.rows.find((r) => (r.metadata as { field?: string }).field === "assigneeId");
    if (assigneeRow && fresh.assigneeId && fresh.assigneeId !== actor.id) {
      await emit({ type: "TASK_ASSIGNED", task: toEventTask(fresh), actor: { id: actor.id, name: actor.name }, activityId: assigneeRow.id });
    }
    if (assigneeRow && !fresh.assigneeId && existing.assigneeId && existing.assigneeId !== actor.id) {
      await emit({ type: "TASK_UNASSIGNED", task: toEventTask(fresh), actor: { id: actor.id, name: actor.name }, activityId: assigneeRow.id, payload: { previousAssigneeId: existing.assigneeId } });
    }
  }
  return fresh;
}

/** "To do / Doing / Stuck / Done" from an old screen → the hops that get there. */
async function applyLegacyStatus(actor: ActorUser, task: Task, status: TaskStatus, scope: Scope): Promise<Task> {
  const acc = await loadAccessRow(task.id);
  if (!acc) return task;
  let current = task;
  for (const to of pathToStatus(current.state, status, Boolean(current.assigneeId))) {
    const extra: TransitionExtra = to === "WAITING" ? { waitingReason: "OTHER", waitingNote: "Stuck" } : to === "RESOLVED" ? { resolutionCode: "COMPLETED" } : {};
    current = await moveOnce(actor, current, to, extra, scope, { ...acc.root, state: current.state }, acc.task.parentId !== null);
  }
  return current;
}

/* ---------------------------------------------------------------- delete */

/** Soft delete: the task and its steps get one shared timestamp. */
export async function deleteWork(actor: ActorUser, id: string): Promise<{ ids: string[]; deletedAt: Date }> {
  const scope = await loadScope(actor);
  const existing = await prisma.task.findUnique({ where: { id }, select: { id: true, projectId: true, deletedAt: true, isPrivate: true, ownerId: true } });
  if (!existing || existing.deletedAt) notFound();
  const acc = await loadAccessRow(id);
  if (!acc || !(await canSeeTask(actor, acc.root, scope))) notFound();
  if (!(await canDeleteTask(actor, acc.root, scope))) throw new HttpError(403, "You can't delete this task.");
  const deletedAt = new Date();
  const ids = await prisma.$transaction(async (tx) => {
    const list = await subtreeIds(tx, scopeOf(existing), id, false);
    await tx.task.updateMany({ where: { id: { in: list } }, data: { deletedAt } });
    await recordChanges(tx, id, { deletedAt: null }, { deletedAt }, actor.id);
    return list;
  });
  if (existing.projectId) await reviewsSafely(existing.projectId, actor.id);
  return { ids, deletedAt };
}

/** Awaited (serverless freezes work started after the response), never fatal. */
async function reviewsSafely(projectId: string, actorId: string): Promise<void> {
  try {
    await syncProjectReviews(projectId, actorId);
  } catch (err) {
    console.error("[work] review sync failed:", (err as Error).message);
  }
}

export type { Actor };
