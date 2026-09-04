import type { Project, Task, User } from "@prisma/client";
import { asGates } from "./gates";
import type {
  CalendarEventDTO,
  DepartmentDTO,
  LinkItem,
  ProjectDTO,
  ProjectNoteDTO,
  TaskDTO,
  UserDTO,
} from "./types";

function asLinks(value: unknown): LinkItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((l) => {
    if (!l || typeof l !== "object") return [];
    const rec = l as Record<string, unknown>;
    if (typeof rec.url !== "string") return [];
    return [{ label: typeof rec.label === "string" ? rec.label : rec.url, url: rec.url }];
  });
}

/**
 * Task rows are read back with their completer joined, so the Changelog and the
 * Review queue can print a name without a second lookup per row.
 */
export type TaskRow = Task & {
  completedBy?: { id: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
  _count?: { notes: number };
};

/**
 * Joined onto every task read. The note count is a `_count` include rather
 * than a column, so rows can advertise a conversation without a migration.
 */
export const COMPLETED_BY_SELECT = {
  completedBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  _count: { select: { notes: true } },
} as const;

export function serializeTask(task: TaskRow): TaskDTO {
  return {
    id: task.id,
    projectId: task.projectId,
    isPrivate: task.isPrivate,
    ownerId: task.ownerId,
    personalProjectId: task.personalProjectId,
    groupColor: task.groupColor,
    parentId: task.parentId,
    title: task.title,
    descriptionMd: task.descriptionMd,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    dueProvisional: task.dueProvisional,
    orderKey: task.orderKey,
    gates: asGates(task.gates),
    tags: task.tags,
    links: asLinks(task.links),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
    pinnedAt: task.pinnedAt ? task.pinnedAt.toISOString() : null,
    deliverableUrl: task.deliverableUrl,
    completedById: task.completedById,
    completedByName: task.completedBy?.name ?? null,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    color: task.color ?? null,
    hasDescription: task.descriptionMd.trim().length > 0,
    noteCount: task._count?.notes ?? 0,
  };
}

/** Never carries passwordHash. There is no shape of this that includes it. */
export function serializeUser(user: User, ownedProjectCount = 0): UserDTO {
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
    ownedProjectCount,
  };
}

export type ProjectRow = Project & { lead?: { id: string; name: string } | null };

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
    health: project.health,
    gateTemplate: asGates(project.gateTemplate),
    orderKey: project.orderKey,
    createdAt: project.createdAt.toISOString(),
    taskCount,
    description: project.description,
    leadId: project.leadId,
    leadName: project.lead?.name ?? null,
    departmentId: project.departmentId,
    ownerId: project.ownerId,
    priority: project.priority,
    deadline: project.deadline ? project.deadline.toISOString() : null,
  };
}

/** Joined onto department reads so the HOD's name prints without a second
    lookup. Optional — old callers without the include still serialize. */
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

export function serializeProjectNote(note: {
  id: string;
  projectId: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string; role: UserDTO["role"] };
}): ProjectNoteDTO {
  return {
    id: note.id,
    projectId: note.projectId,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    author: note.author,
  };
}

/* A calendar day (stored as that day's UTC midnight) reads back as the same
   date for everyone. Lives here, not in the route file: an App-Router route
   module may only export request handlers and config, so a shared serializer
   belongs in lib alongside its siblings. */
/** The relations eventToDTO needs — one include, shared by every event handler
    (create/edit/delete/read) so the serialized shape is always complete. */
export const eventInclude = {
  project: { select: { name: true, color: true } },
  createdBy: { select: { name: true } },
  attendees: { select: { userId: true, user: { select: { name: true } } } },
} as const;

export function eventToDTO(e: {
  id: string;
  title: string;
  description: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  isMeeting: boolean;
  projectId: string | null;
  createdById: string;
  createdAt: Date;
  project: { name: string; color: string } | null;
  createdBy: { name: string };
  attendees?: { userId: string; user: { name: string } }[];
}): CalendarEventDTO {
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
    isGlobal: e.projectId === null,
    attendees: (e.attendees ?? []).map((a) => ({ userId: a.userId, name: a.user.name })),
    createdById: e.createdById,
    createdByName: e.createdBy.name,
    createdAt: e.createdAt.toISOString(),
  };
}
