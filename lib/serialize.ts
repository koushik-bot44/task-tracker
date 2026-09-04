import type { Comment, Milestone, Project, Task, User } from "@prisma/client";
import type {
  CalendarEventDTO,
  CommentDTO,
  DepartmentDTO,
  MeetingResponse,
  MilestoneDTO,
  ProjectDTO,
  ProjectPersonDTO,
  TaskDTO,
  UserDTO,
} from "./types";

/**
 * Task rows are read back with their people joined so every list can print
 * names without a second lookup.
 */
export type TaskRow = Task & {
  completedBy?: { id: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
  givenBy?: { id: string; name: string } | null;
  _count?: { children?: number };
  /** Steps done, computed by the caller when it has the sibling list. */
  stepsDone?: number;
  stepCount?: number;
  noteCount?: number;
};

/** Joined onto every task read. */
export const TASK_INCLUDE = {
  completedBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  givenBy: { select: { id: true, name: true } },
} as const;
/** Back-compat name for the few callers that still use it. */
export const COMPLETED_BY_SELECT = TASK_INCLUDE;

export function serializeTask(task: TaskRow): TaskDTO {
  return {
    id: task.id,
    projectId: task.projectId,
    isPrivate: task.isPrivate,
    ownerId: task.ownerId,
    personalProjectId: task.personalProjectId,
    parentId: task.parentId,
    milestoneId: task.milestoneId,
    title: task.title,
    descriptionMd: task.descriptionMd,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    dueProvisional: task.dueProvisional,
    orderKey: task.orderKey,
    important: task.important,
    archived: task.archived,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
    deliverableUrl: task.deliverableUrl,
    completedById: task.completedById,
    completedByName: task.completedBy?.name ?? null,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    givenById: task.givenById,
    givenByName: task.givenBy?.name ?? null,
    hasDescription: task.descriptionMd.trim().length > 0,
    noteCount: task.noteCount ?? 0,
    stepCount: task.stepCount ?? task._count?.children ?? 0,
    stepsDone: task.stepsDone ?? 0,
  };
}

/**
 * Fill stepCount / stepsDone / noteCount across a list in one pass. Steps are
 * the live children of each root; notes come from a grouped Comment count.
 */
export function withCounts(rows: TaskRow[], noteCounts: Map<string, number>): TaskRow[] {
  const steps = new Map<string, { total: number; done: number }>();
  for (const r of rows) {
    if (!r.parentId || r.deletedAt) continue;
    const s = steps.get(r.parentId) ?? { total: 0, done: 0 };
    s.total++;
    if (r.status === "DONE") s.done++;
    steps.set(r.parentId, s);
  }
  return rows.map((r) => ({
    ...r,
    stepCount: steps.get(r.id)?.total ?? 0,
    stepsDone: steps.get(r.id)?.done ?? 0,
    noteCount: noteCounts.get(r.id) ?? 0,
  }));
}

/** Never carries passwordHash. There is no shape of this that includes it. */
export function serializeUser(
  user: User & { department?: { name: string } | null },
  ownedProjectCount = 0,
): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status === "PENDING" ? "PENDING" : "ACTIVE",
    createdAt: user.createdAt.toISOString(),
    disabledAt: user.disabledAt ? user.disabledAt.toISOString() : null,
    emailOptIn: user.emailOptIn,
    phone: user.phone ?? null,
    whatsappOptIn: user.whatsappOptIn,
    departmentId: user.departmentId ?? null,
    departmentName: user.department?.name ?? null,
    ownedProjectCount,
  };
}

export type ProjectRow = Project & {
  lead?: { id: string; name: string } | null;
  /** Filled by lib/project-people; empty when a caller has no people to show. */
  people?: ProjectPersonDTO[];
  nextMilestone?: { id: string; name: string; reviewDate: Date } | null;
  openTasks?: number;
  doneTasks?: number;
  overdueTasks?: number;
  behind?: boolean;
};

export const PROJECT_LEAD_SELECT = {
  lead: { select: { id: true, name: true } },
} as const;

export function serializeProject(project: ProjectRow, taskCount = 0): ProjectDTO {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    color: project.color,
    icon: project.icon,
    status: project.status,
    orderKey: project.orderKey,
    createdAt: project.createdAt.toISOString(),
    startDate: project.startDate ? project.startDate.toISOString() : null,
    deadline: project.deadline ? project.deadline.toISOString() : null,
    progress: project.progress,
    priority: project.priority,
    taskCount,
    openTasks: project.openTasks ?? 0,
    doneTasks: project.doneTasks ?? 0,
    overdueTasks: project.overdueTasks ?? 0,
    description: project.description,
    leadId: project.leadId,
    leadName: project.lead?.name ?? null,
    departmentId: project.departmentId,
    ownerId: project.ownerId,
    people: project.people ?? [],
    nextMilestone: project.nextMilestone
      ? { id: project.nextMilestone.id, name: project.nextMilestone.name, reviewDate: project.nextMilestone.reviewDate.toISOString() }
      : null,
    behind: project.behind ?? false,
  };
}

export const DEPARTMENT_HOD_SELECT = {
  hod: { select: { id: true, name: true } },
} as const;

export function serializeDepartment(
  department: {
    id: string;
    name: string;
    color: string;
    icon: string | null;
    orderKey: string;
    createdAt: Date;
    description?: string;
    hodId?: string | null;
    hod?: { id: string; name: string } | null;
  },
  projectCount = 0,
): DepartmentDTO {
  return {
    id: department.id,
    name: department.name,
    color: department.color,
    icon: department.icon,
    orderKey: department.orderKey,
    createdAt: department.createdAt.toISOString(),
    description: department.description ?? "",
    hodId: department.hodId ?? null,
    hodName: department.hod?.name ?? null,
    projectCount,
  };
}

export const COMMENT_INCLUDE = {
  author: { select: { id: true, name: true, role: true } },
} as const;

export function serializeComment(c: Comment & { author: { id: string; name: string; role: UserDTO["role"] } }): CommentDTO {
  return {
    id: c.id,
    targetType: c.targetType,
    targetId: c.targetId,
    body: c.body,
    attachmentUrl: c.attachmentUrl,
    attachmentName: c.attachmentName,
    attachmentType: c.attachmentType,
    createdAt: c.createdAt.toISOString(),
    author: c.author,
  };
}

export type MilestoneRow = Milestone & {
  taskCount?: number;
  doneCount?: number;
  noteCount?: number;
  latestNote?: CommentDTO | null;
};

export function serializeMilestone(m: MilestoneRow): MilestoneDTO {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    reviewDate: m.reviewDate.toISOString(),
    orderKey: m.orderKey,
    reviewEventId: m.reviewEventId,
    outcome: m.outcome,
    outcomeNote: m.outcomeNote,
    outcomeAt: m.outcomeAt ? m.outcomeAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    taskCount: m.taskCount ?? 0,
    doneCount: m.doneCount ?? 0,
    noteCount: m.noteCount ?? 0,
    latestNote: m.latestNote ?? null,
  };
}

/** The relations eventToDTO needs — one include, shared by every event handler. */
export const eventInclude = {
  project: { select: { name: true, color: true, slug: true } },
  milestone: { select: { name: true } },
  createdBy: { select: { name: true } },
  attendees: { select: { userId: true, response: true, respondedAt: true, user: { select: { name: true } } } },
} as const;

export function eventToDTO(
  e: {
    id: string;
    title: string;
    description: string;
    date: Date;
    startTime: string | null;
    endTime: string | null;
    isMeeting: boolean;
    projectId: string | null;
    milestoneId: string | null;
    createdById: string;
    createdAt: Date;
    project: { name: string; color: string; slug: string } | null;
    milestone?: { name: string } | null;
    createdBy: { name: string };
    attendees?: { userId: string; response: string | null; respondedAt: Date | null; user: { name: string } }[];
  },
  viewer?: { id: string; canReschedule: boolean },
): CalendarEventDTO {
  const attendees = (e.attendees ?? []).map((a) => ({
    userId: a.userId,
    name: a.user.name,
    response: (a.response === "YES" || a.response === "NO" ? a.response : null) as MeetingResponse | null,
    respondedAt: a.respondedAt ? a.respondedAt.toISOString() : null,
  }));
  const mine = viewer ? attendees.find((a) => a.userId === viewer.id) : undefined;
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date.toISOString(),
    startTime: e.startTime,
    endTime: e.endTime,
    isMeeting: e.isMeeting,
    projectId: e.projectId,
    projectName: e.project?.name ?? null,
    projectColor: e.project?.color ?? null,
    projectSlug: e.project?.slug ?? null,
    milestoneId: e.milestoneId,
    milestoneName: e.milestone?.name ?? null,
    isGlobal: e.projectId === null,
    attendees,
    myResponse: mine?.response ?? null,
    isAttendee: Boolean(mine),
    canReschedule: viewer ? viewer.canReschedule || viewer.id === e.createdById : false,
    createdById: e.createdById,
    createdByName: e.createdBy.name,
    createdAt: e.createdAt.toISOString(),
  };
}
