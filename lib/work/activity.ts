/**
 * The Activity Stream writer (work model, 2026-09-09). Every change to a task
 * lands here as one row: a note, a team note, a field change with old and new
 * values, a file, or a line the system wrote. Nobody types "I changed the
 * priority" into a note — the row is made from the change itself.
 */
import type { ActivityType, Prisma, Task } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatISTDate } from "@/lib/timezone";
import {
  RESOLUTION_CODE_LABEL,
  WAITING_REASON_LABEL,
  WORK_PRIORITY_LABEL,
  WORK_STATE_LABEL,
  WORK_TYPE_LABEL,
  type ActivityDTO,
} from "@/lib/types";

export type Tx = Prisma.TransactionClient;

export const ACTIVITY_INCLUDE = { author: { select: { id: true, name: true, role: true } } } as const;
export type ActivityRow = Prisma.TaskActivityGetPayload<{ include: typeof ACTIVITY_INCLUDE }>;

export function serializeActivity(a: ActivityRow): ActivityDTO {
  return {
    id: a.id,
    taskId: a.taskId,
    type: a.type,
    visibility: a.visibility,
    body: a.body,
    metadata: (a.metadata ?? {}) as Record<string, unknown>,
    attachmentUrl: a.attachmentUrl,
    attachmentName: a.attachmentName,
    attachmentType: a.attachmentType,
    createdAt: a.createdAt.toISOString(),
    author: a.author,
  };
}

/** The fields whose changes are recorded, with the word the stream uses. */
export const TRACKED_FIELDS = [
  ["title", "Title"],
  ["state", "Status"],
  ["priority", "Priority"],
  ["type", "Type"],
  ["assigneeId", "Assigned to"],
  ["assignmentGroupId", "Team"],
  ["departmentId", "Department"],
  ["requesterId", "Requested by"],
  ["categoryId", "Category"],
  ["dueDate", "Due"],
  ["milestoneId", "Milestone"],
  ["projectId", "Project"],
  ["parentId", "Part of"],
  ["waitingReason", "Waiting for"],
  ["resolutionCode", "Resolution"],
  ["archived", "Put away"],
  ["important", "Important"],
  ["deletedAt", "Deleted"],
] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number][0];
export const FIELD_LABEL: Record<TrackedField, string> = Object.fromEntries(TRACKED_FIELDS) as Record<TrackedField, string>;

type Snapshot = Partial<Pick<Task, TrackedField>>;

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : a === null || a === undefined ? null : new Date(a as string).getTime();
    const tb = b instanceof Date ? b.getTime() : b === null || b === undefined ? null : new Date(b as string).getTime();
    return ta === tb;
  }
  return (a ?? null) === (b ?? null);
}

/** A value as the words a person reads: a name, a date, a label. */
async function labelFor(tx: Tx, field: TrackedField, value: unknown): Promise<string | null> {
  if (value === null || value === undefined) return null;
  const id = String(value);
  switch (field) {
    case "assigneeId":
    case "requesterId":
      return (await tx.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? "Someone who left";
    case "assignmentGroupId":
      return (await tx.assignmentGroup.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
    case "departmentId":
      return (await tx.department.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
    case "categoryId":
      return (await tx.taskCategory.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
    case "milestoneId":
      return (await tx.milestone.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
    case "projectId":
      return (await tx.project.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
    case "parentId":
      return (await tx.task.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
    case "dueDate":
    case "deletedAt":
      return formatISTDate(value instanceof Date ? value : new Date(id));
    case "state":
      return WORK_STATE_LABEL[value as keyof typeof WORK_STATE_LABEL] ?? id;
    case "priority":
      return WORK_PRIORITY_LABEL[value as keyof typeof WORK_PRIORITY_LABEL] ?? id;
    case "type":
      return WORK_TYPE_LABEL[value as keyof typeof WORK_TYPE_LABEL] ?? id;
    case "waitingReason":
      return WAITING_REASON_LABEL[value as keyof typeof WAITING_REASON_LABEL] ?? id;
    case "resolutionCode":
      return RESOLUTION_CODE_LABEL[value as keyof typeof RESOLUTION_CODE_LABEL] ?? id;
    case "archived":
    case "important":
      return value ? "Yes" : "No";
    default:
      return id;
  }
}

function plain(v: unknown): string | number | boolean | null {
  if (v instanceof Date) return v.toISOString();
  if (v === null || v === undefined) return null;
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : String(v);
}

/**
 * Diff two snapshots of a task and write one FIELD_CHANGE row per tracked
 * field that differs. Returns the rows written (the caller feeds them to the
 * event layer). Runs inside the caller's transaction.
 */
export async function recordChanges(
  tx: Tx,
  taskId: string,
  before: Snapshot,
  after: Snapshot,
  actorId: string | null,
  extra: Record<string, unknown> = {},
): Promise<ActivityRow[]> {
  const rows: ActivityRow[] = [];
  for (const [field] of TRACKED_FIELDS) {
    if (!(field in after)) continue;
    const oldValue = before[field];
    const newValue = after[field];
    if (same(oldValue, newValue)) continue;
    const [oldLabel, newLabel] = await Promise.all([labelFor(tx, field, oldValue), labelFor(tx, field, newValue)]);
    const row = await tx.taskActivity.create({
      data: {
        taskId,
        authorId: actorId,
        type: "FIELD_CHANGE",
        visibility: "PUBLIC",
        body: "",
        metadata: { field, label: FIELD_LABEL[field], oldValue: plain(oldValue), newValue: plain(newValue), oldLabel, newLabel, ...extra } as Prisma.InputJsonObject,
      },
      include: ACTIVITY_INCLUDE,
    });
    rows.push(row);
  }
  return rows;
}

/** A line the system writes ("Routed to Network Team by rule …"). */
export async function recordSystem(tx: Tx, taskId: string, body: string, metadata: Record<string, unknown> = {}, actorId: string | null = null): Promise<ActivityRow> {
  return tx.taskActivity.create({
    data: { taskId, authorId: actorId, type: "SYSTEM", visibility: "PUBLIC", body, metadata: metadata as Prisma.InputJsonObject },
    include: ACTIVITY_INCLUDE,
  });
}

export type NoteInput = {
  body: string;
  /** A team note (INTERNAL) or a note everyone on the task reads (PUBLIC). */
  internal: boolean;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  /** User ids named with @ in the body. */
  mentions?: string[];
};

/** A note, a team note, or (words empty, file present) a file. */
export async function addNote(taskId: string, actorId: string, input: NoteInput): Promise<ActivityRow> {
  const hasFile = Boolean(input.attachmentUrl);
  const type: ActivityType = input.body.trim().length === 0 && hasFile ? "ATTACHMENT" : input.internal ? "WORK_NOTE" : "COMMENT";
  const mentions = [...new Set(input.mentions ?? [])];
  return prisma.taskActivity.create({
    data: {
      taskId,
      authorId: actorId,
      type,
      visibility: input.internal ? "INTERNAL" : "PUBLIC",
      body: input.body,
      metadata: (mentions.length ? { mentions } : {}) as Prisma.InputJsonObject,
      attachmentUrl: input.attachmentUrl ?? null,
      attachmentName: input.attachmentName ?? null,
      attachmentType: input.attachmentType ?? null,
    },
    include: ACTIVITY_INCLUDE,
  });
}

export type ActivityQuery = {
  /** May read INTERNAL rows. */
  staff: boolean;
  types?: ActivityType[];
  order?: "asc" | "desc";
  /** Only rows that mention this user. */
  mentioning?: string;
  /** Only the field changes (the history view). */
  historyOnly?: boolean;
};

export async function listActivity(taskId: string, q: ActivityQuery): Promise<ActivityRow[]> {
  const where: Prisma.TaskActivityWhereInput = { taskId };
  if (!q.staff) where.visibility = "PUBLIC";
  if (q.historyOnly) where.type = "FIELD_CHANGE";
  else if (q.types?.length) where.type = { in: q.types };
  if (q.mentioning) where.metadata = { path: ["mentions"], array_contains: q.mentioning };
  return prisma.taskActivity.findMany({ where, orderBy: { createdAt: q.order ?? "asc" }, include: ACTIVITY_INCLUDE });
}

/** Note counts (public, or public + team) for a set of tasks, one grouped query. */
export async function noteCounts(taskIds: string[], staff: boolean): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const grouped = await prisma.taskActivity.groupBy({
    by: ["taskId"],
    where: { taskId: { in: taskIds }, type: { in: staff ? ["COMMENT", "WORK_NOTE", "ATTACHMENT"] : ["COMMENT", "ATTACHMENT"] }, ...(staff ? {} : { visibility: "PUBLIC" }) },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.taskId, g._count._all]));
}
