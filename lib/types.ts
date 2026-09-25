import type { Role as AuthRole } from "./auth";

/*
 * ONE ARRAY PER SET. The type is derived from it, and lib/validation.ts
 * derives its zod enum from the same array.
 *
 * Standing law after phase 5 batch 1: a set written out twice is a set that
 * will eventually disagree with itself.
 *
 * Restructure (2026-09-04): four task statuses, four project statuses. The
 * labels are the words the founder uses; nothing here is jargon.
 */
export const TASK_STATUSES = ["TODO", "DOING", "STUCK", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
/** Back-compat alias for the few shared files that still say `Status`. */
export type Status = TaskStatus;
export const STATUSES = TASK_STATUSES;

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To do",
  DOING: "Doing",
  STUCK: "Stuck",
  DONE: "Done",
};
export const STATUS_LABEL = TASK_STATUS_LABEL;

export const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "PAUSED", "DONE"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  PAUSED: "Paused",
  DONE: "Done",
};

/**
 * Project priority (owner, 2026-09-04): shown as P1 / P2 / P3 and used to
 * arrange projects — a higher priority floats to the top. The column keeps
 * its four values; CRITICAL (legacy) reads and ranks as P1.
 */
export const PROJECT_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type ProjectPriorityValue = (typeof PROJECT_PRIORITIES)[number];
/** The three the picker offers. */
export const PROJECT_PRIORITY_CHOICES = ["HIGH", "MEDIUM", "LOW"] as const;
export const PROJECT_PRIORITY_LABEL: Record<ProjectPriorityValue, string> = {
  CRITICAL: "P1",
  HIGH: "P1",
  MEDIUM: "P2",
  LOW: "P3",
};
/** Lower ranks first. */
export const PROJECT_PRIORITY_RANK: Record<ProjectPriorityValue, number> = {
  CRITICAL: 1,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export const MILESTONE_OUTCOMES = ["ON_TRACK", "NEEDS_WORK"] as const;
export type MilestoneOutcome = (typeof MILESTONE_OUTCOMES)[number];
export const MILESTONE_OUTCOME_LABEL: Record<MilestoneOutcome, string> = {
  ON_TRACK: "On track",
  NEEDS_WORK: "Needs work",
};

export const COMMENT_TARGETS = ["PROJECT", "MILESTONE", "TASK"] as const;
export type CommentTarget = (typeof COMMENT_TARGETS)[number];

/*
 * Work model (2026-09-09). The task is the record; these are its axes. One
 * array per set, labels in the owner's words (no jargon on screen).
 */
export const WORK_TYPES = ["GENERAL", "ISSUE", "REQUEST", "PROJECT_TASK", "APPROVAL", "SUPPORT"] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  GENERAL: "Task",
  ISSUE: "Issue",
  REQUEST: "Request",
  PROJECT_TASK: "Project Task",
  APPROVAL: "Approval",
  SUPPORT: "Support",
};
/**
 * Somebody asking you for something waits under Requests, never among your own
 * work (owner, 2026-09-15). Split once, here, so a tab's count and the rows it
 * shows can never disagree about which kinds belong to whom.
 */
export const REQUEST_WORK_TYPES: WorkType[] = ["REQUEST", "APPROVAL"];
/** Your own work is every other kind. */
export const OWN_WORK_TYPES: WorkType[] = WORK_TYPES.filter((t) => !REQUEST_WORK_TYPES.includes(t));

/** The letter in front of the number: T-1024, I-1025, R-1026 … */
export const WORK_TYPE_PREFIX: Record<WorkType, string> = {
  GENERAL: "TASK",
  ISSUE: "TASK",
  REQUEST: "REQ",
  PROJECT_TASK: "PTASK",
  APPROVAL: "APR",
  SUPPORT: "TASK",
};
/** "Fix The Login Page": the first letter, and every letter after a space, in capitals. */
export function titleCase(s: string): string {
  return s.replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
}

/** "TASK0001024" — the number the way a service desk writes it, on every screen and in every message. */
export function workRef(type: WorkType, number: number): string {
  return `${WORK_TYPE_PREFIX[type]}${String(number).padStart(7, "0")}`;
}

export const WORK_STATES = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED", "CANCELLED", "ESCALATED", "REOPENED"] as const;
export type WorkState = (typeof WORK_STATES)[number];
export const WORK_STATE_LABEL: Record<WorkState, string> = {
  NEW: "New",
  ASSIGNED: "New",
  IN_PROGRESS: "Work in progress",
  WAITING: "On Hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Canceled",
  ESCALATED: "Escalated",
  REOPENED: "Reopened",
};
/** States where the work is still live. */
export const OPEN_STATES: readonly WorkState[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "ESCALATED", "REOPENED"];
/** States where the work is over (resolved, closed or cancelled). */
export const FINISHED_STATES: readonly WorkState[] = ["RESOLVED", "CLOSED", "CANCELLED"];

export const WORK_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type WorkPriority = (typeof WORK_PRIORITIES)[number];
export const WORK_PRIORITY_LABEL: Record<WorkPriority, string> = {
  CRITICAL: "1 - Critical",
  HIGH: "2 - High",
  MEDIUM: "3 - Moderate",
  LOW: "4 - Low",
};
/** Lower ranks first. */
export const WORK_PRIORITY_RANK: Record<WorkPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export const WAITING_REASONS = ["REQUESTER", "APPROVAL", "OTHER_TEAM", "VENDOR", "PARTS", "OTHER"] as const;
export type WaitingReason = (typeof WAITING_REASONS)[number];
export const WAITING_REASON_LABEL: Record<WaitingReason, string> = {
  REQUESTER: "Awaiting Requester",
  APPROVAL: "Awaiting Approval",
  OTHER_TEAM: "Awaiting Other Team",
  VENDOR: "Awaiting Vendor",
  PARTS: "Awaiting Parts",
  OTHER: "Other",
};

/**
 * How often a task comes round again (owner, 2026-09-15). Kept here, not in
 * lib/work/repeats.ts, because the screens need the words and that file reaches
 * for the database — a client component must not drag it into the browser.
 */
/**
 * What a state is CALLED, given what kind of thing it is (owner, 2026-09-16:
 * "if it approevd it shouls show approved"). An approval that was granted does
 * not read as "Resolved", and one that was refused does not read as "Canceled".
 */
export function workStatusLabel(type: WorkType, state: WorkState): string {
  if (type === "APPROVAL") {
    if (state === "RESOLVED" || state === "CLOSED") return "Approved";
    if (state === "CANCELLED") return "Declined";
  }
  return WORK_STATE_LABEL[state];
}

export const REPEATS = ["DAY", "WEEK", "MONTH"] as const;
export type Repeats = (typeof REPEATS)[number];
export const REPEATS_LABEL: Record<Repeats, string> = {
  DAY: "Every day",
  WEEK: "Every week",
  MONTH: "Every month",
};

export const RESOLUTION_CODES = ["FIXED", "COMPLETED", "WORKAROUND", "CANNOT_REPRODUCE", "DUPLICATE", "NOT_NEEDED"] as const;
export type ResolutionCode = (typeof RESOLUTION_CODES)[number];
export const RESOLUTION_CODE_LABEL: Record<ResolutionCode, string> = {
  FIXED: "Fixed",
  COMPLETED: "Completed",
  WORKAROUND: "Worked around",
  CANNOT_REPRODUCE: "Could not reproduce",
  DUPLICATE: "Duplicate of another task",
  NOT_NEEDED: "Not needed any more",
};

export const ACTIVITY_TYPES = ["COMMENT", "WORK_NOTE", "FIELD_CHANGE", "SYSTEM", "ATTACHMENT", "EMAIL", "MENTION"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_VISIBILITIES = ["PUBLIC", "INTERNAL"] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITIES)[number];

/** One line of a task's activity stream. */
/** One file on a note (2026-09-10): a note can carry several. */
export type AttachmentDTO = { id: string; url: string; name: string; type: string; size: number | null };

export type ActivityDTO = {
  id: string;
  taskId: string;
  type: ActivityType;
  visibility: ActivityVisibility;
  body: string;
  /** FIELD_CHANGE: {field, oldValue, newValue, oldLabel, newLabel}; notes: {mentions?: string[]}. */
  metadata: Record<string, unknown>;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  /** Every file on the note, in order; the attachment* fields above hold the first. */
  attachments: AttachmentDTO[];
  /** Set when the file is pinned to the top of the record. */
  pinnedAt: string | null;
  createdAt: string;
  /** Null = the system did it. */
  author: { id: string; name: string; role: UserRole } | null;
};

/** A team inside a department (the assignment group). */
export type AssignmentGroupDTO = {
  id: string;
  name: string;
  description: string;
  departmentId: string;
  departmentName: string;
  leadId: string | null;
  leadName: string | null;
  active: boolean;
  orderKey: string;
  createdAt: string;
  members: { id: string; name: string; role: UserRole }[];
  /** Live tasks held by the team. */
  openTasks: number;
};

export type TaskCategoryDTO = {
  id: string;
  name: string;
  parentId: string | null;
  departmentId: string | null;
  assignmentGroupId: string | null;
  assignmentGroupName: string | null;
  active: boolean;
  orderKey: string;
};

export type AssignmentRuleDTO = {
  id: string;
  name: string;
  order: number;
  active: boolean;
  match: { type?: WorkType; categoryId?: string; departmentId?: string; priority?: WorkPriority };
  set: { departmentId?: string; assignmentGroupId?: string; assigneeId?: string; priority?: WorkPriority; escalate?: boolean };
};

/** "YES" = I'll be there, "NO" = Can't, null = no reply yet. */
export type MeetingResponse = "YES" | "NO";

/** Wire shape: dates are ISO strings once they cross the JSON boundary. */
export type TaskDTO = {
  id: string;
  /** Null for a PRIVATE personal task (My notes) — it belongs to no project. */
  projectId: string | null;
  isPrivate: boolean;
  ownerId: string | null;
  personalProjectId: string | null;
  /** A step's parent. Project tasks are one level deep: a step's parentId is
      always a root task (deeper rows are flattened on read). */
  parentId: string | null;
  /** The stage box this task sits in; null = "Not in a stage yet" on screen. */
  milestoneId: string | null;
  title: string;
  /** My notes only (the private-task Notes box). "" on project tasks. */
  descriptionMd: string;
  status: TaskStatus;
  dueDate: string | null;
  dueProvisional: boolean;
  /** Set when the task comes round again (owner, 2026-09-15). */
  repeats: Repeats | null;
  orderKey: string;
  important: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  deliverableUrl: string | null;
  completedById: string | null;
  completedByName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  /** Who gave the task — the giver Face on Today. */
  givenById: string | null;
  givenByName: string | null;
  /** Who the work came from — the giver, or whoever raised it on a self-pickup. */
  assignedByName: string | null;
  hasDescription: boolean;
  noteCount: number;
  /** Steps under a root task (0 for a step itself). */
  stepCount: number;
  stepsDone: number;
  /* Work model (2026-09-09). */
  number: number;
  /** "T-1024" — the number with its type letter. */
  ref: string;
  type: WorkType;
  state: WorkState;
  priority: WorkPriority;
  categoryId: string | null;
  categoryName: string | null;
  /** Who asked for this. */
  requesterId: string | null;
  requesterName: string | null;
  /** Shared by every record of one task that went to several people. */
  siblingKey: string | null;
  /** When it landed in somebody's hands; null while nobody holds it. */
  assignedAt: string | null;
  /** The OTHER people holding this same task. Empty unless the record was loaded. */
  alsoWith: { id: string; name: string }[];
  departmentId: string | null;
  departmentName: string | null;
  /** The team it sits with. */
  assignmentGroupId: string | null;
  assignmentGroupName: string | null;
  waitingReason: WaitingReason | null;
  waitingNote: string | null;
  resolutionCode: ResolutionCode | null;
  resolutionNotes: string | null;
  rootCause: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  escalatedAt: string | null;
  /** The project it sits in (work model: shown on the list). */
  projectName: string | null;
  projectSlug: string | null;
  /** How far along, 0–100, marked by hand (owner, 2026-09-11); null = not marked. */
  progress: number | null;
  /** The soonest meeting ahead on this task, when a list asked for it. */
  nextMeeting: { date: string; startTime: string | null; title: string } | null;
  /** Present on a single-task read: what the caller may do. */
  access?: TaskAccessDTO;
};

export type ProjectPersonDTO = {
  /** Invited and hasn't set a password yet (2026-09-11). */
  invited?: boolean;
  id: string;
  name: string;
  role: UserRole;
  /** The department this person belongs to; null if they are not placed. */
  departmentName: string | null;
  isLead: boolean;
  isOwner: boolean;
  isMember: boolean;
  canManage: boolean;
  /** Live, unarchived tasks held in this project. */
  taskCount: number;
};

export type ProjectDTO = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string | null;
  /** An uploaded logo; null = the icon (or initial) on a colour tile. */
  logoUrl: string | null;
  status: ProjectStatus;
  orderKey: string;
  createdAt: string;
  startDate: string | null;
  deadline: string | null;
  /** 0-100, set by hand by the CEO. Never computed. */
  /** Shown number: the CEO's own when set by hand, else tasks done ÷ tasks. */
  progress: number;
  /** The CEO's number, or null when the tasks are counted. */
  progressManual: number | null;
  priority: ProjectPriorityValue;
  /** Pinned to the top of its department by someone who runs it. */
  pinned: boolean;
  taskCount: number;
  openTasks: number;
  doneTasks: number;
  overdueTasks: number;
  description: string;
  leadId: string | null;
  leadName: string | null;
  departmentId: string | null;
  ownerId: string | null;
  /** Everyone on the project (lead, owner, members, task holders), lead first. */
  people: ProjectPersonDTO[];
  /** The next milestone whose review has not happened yet. */
  nextMilestone: { id: string; name: string; reviewDate: string } | null;
  /** Late: past deadline and not done, an overdue task, or a review date passed with no outcome. */
  behind: boolean;
};

export type MilestoneDTO = {
  id: string;
  projectId: string;
  name: string;
  reviewDate: string;
  orderKey: string;
  reviewEventId: string | null;
  outcome: MilestoneOutcome | null;
  outcomeNote: string | null;
  outcomeAt: string | null;
  createdAt: string;
  taskCount: number;
  doneCount: number;
  noteCount: number;
  latestNote: CommentDTO | null;
};

export type CommentDTO = {
  id: string;
  targetType: CommentTarget;
  targetId: string;
  body: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  /** Every file on the note, in order; the attachment* fields above hold the first. */
  attachments: AttachmentDTO[];
  createdAt: string;
  author: { id: string; name: string; role: UserRole };
};

/** A department / department of tools (phase 12; company-wide since phase 48). */
export type DepartmentDTO = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  orderKey: string;
  createdAt: string;
  description: string;
  hodId: string | null;
  hodName: string | null;
  /** How many tools THE CALLER CAN SEE are filed here. */
  projectCount: number;
};

/** A task on the calendar: its date, with the date-state and project colour the chip needs. */
export type CalendarDeadlineDTO = {
  projectId: string;
  name: string;
  slug: string;
  deadline: string;
  color: string;
};

export type MeetingAttendeeDTO = {
  userId: string;
  name: string;
  response: MeetingResponse | null;
  respondedAt: string | null;
};

export type CalendarEventDTO = {
  id: string;
  title: string;
  description: string;
  date: string;
  /** Meetings: "HH:MM" 24h. null on a plain event. */
  startTime: string | null;
  endTime: string | null;
  isMeeting: boolean;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  projectSlug: string | null;
  /** Set when this meeting is a milestone's review. */
  milestoneId: string | null;
  milestoneName: string | null;
  /** Set when the meeting was scheduled from a task's record (2026-09-11). */
  taskId: string | null;
  taskNumber: number | null;
  taskRef: string | null;
  taskTitle: string | null;
  isGlobal: boolean;
  attendees: MeetingAttendeeDTO[];
  /** The caller's own reply, if they are an attendee. */
  myResponse: MeetingResponse | null;
  isAttendee: boolean;
  /** The caller may reschedule (the organiser or the CEO). */
  canReschedule: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
};

/**
 * A task that falls due on a day. Back on the calendar (owner, 2026-09-15) as a
 * quieter kind than a meeting: it is a date, not something you attend, so it is
 * drawn outlined and never pushes a meeting out of a day.
 */
export type CalendarTaskDateDTO = {
  id: string;
  number: number;
  ref: string;
  title: string;
  dueDate: string;
  projectName: string | null;
  projectSlug: string | null;
};

export type CalendarPayload = {
  events: CalendarEventDTO[];
  deadlines: CalendarDeadlineDTO[];
  taskDates: CalendarTaskDateDTO[];
};

/** Today's page, in one round trip. */
export type TodayDTO = {
  /** Executives and department heads see the company line; null for others. */
  summary: { projects: number; behind: number; reviewsThisWeek: number } | null;
  /** The caller's open tasks: overdue first, then by date. */
  tasks: (TaskDTO & { projectName: string; projectSlug: string })[];
  /** Today's and tomorrow's meetings the caller attends or organises. */
  meetings: CalendarEventDTO[];
};

/** What the caller may do to a task — the record page hides exactly what the server refuses. */
export type TaskAccessDTO = {
  canEdit: boolean;
  canAssign: boolean;
  canDelete: boolean;
  /** May read team notes. */
  staff: boolean;
  transitions: WorkState[];
};

/** Today's work half (work model): counters over what the caller runs, then the lists. */
export type WorkCountersDTO = {
  open: number;
  unassigned: number;
  highPriority: number;
  dueToday: number;
  overdue: number;
  waiting: number;
  resolvedToday: number;
  newToday: number;
};
export type DepartmentWorkLineDTO = { id: string; name: string; color: string; open: number; inProgress: number; waiting: number; overdue: number; unassigned: number };
export type DashboardTodayDTO = {
  /** What the counters cover. */
  level: "company" | "department" | "team" | "mine";
  counters: WorkCountersDTO;
  myWork: TaskDTO[];
  myWorkTotal: number;
  teamWork: TaskDTO[];
  teamWorkTotal: number;
  teams: { id: string; name: string }[];
  /** Heads and the CEO: unheld work in their departments. */
  departmentWork: TaskDTO[];
  departmentWorkTotal: number;
  departments: DepartmentWorkLineDTO[];
  /** The CEO only: every open task in the company. */
  everythingTotal: number | null;
};

export type WorkTallyDTO = { open: number; inProgress: number; waiting: number; overdue: number; unassigned: number };
export type PersonWorkDTO = { id: string; name: string } & WorkTallyDTO;
export type TeamWorkDTO = { id: string; name: string; leadId: string | null; leadName: string | null; people: PersonWorkDTO[] } & WorkTallyDTO;
export type DepartmentWorkDTO = { id: string; name: string; color: string; hodId: string | null; hodName: string | null; teams: TeamWorkDTO[]; unteamed: WorkTallyDTO } & WorkTallyDTO;
/** Names for what a list is narrowed to (GET /api/work?rows=tasks), so the screen can say it in words. */
export type WorkLabelsDTO = { department: string | null; team: string | null; assignee: string | null; requester: string | null; project: string | null };
/** Records a cursor at a time; with rows=tasks, one row per task with numbered pages and labels. */
export type WorkListDTO = { items: TaskDTO[]; nextCursor: string | null; total: number; page?: number; pageSize?: number; labels?: WorkLabelsDTO };

export type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  readAt: string | null;
  createdAt: string;
  snoozedUntil: string | null;
};

export const ROLES = ["FOUNDER", "CO_FOUNDER", "HOD", "MANAGER", "TEAM_LEAD", "RESOURCE", "ADMIN", "PERSON"] as const;
export type UserRole = (typeof ROLES)[number];

/* This list and lib/auth.ts's must stay identical: one decides what the UI
   offers, the other decides which session tokens are accepted at all. */
type _RolesMatch = AuthRole extends UserRole
  ? UserRole extends AuthRole
    ? true
    : never
  : never;
const _rolesMatch: _RolesMatch = true;
void _rolesMatch;

/** Role words appear ONLY on the People page. */
export const ROLE_LABEL: Record<UserRole, string> = {
  FOUNDER: "CEO",
  CO_FOUNDER: "Associate",
  HOD: "Head of department",
  MANAGER: "Manager",
  TEAM_LEAD: "Team lead",
  RESOURCE: "Team member",
  ADMIN: "Admin",
  PERSON: "Person",
};

export const ROLE_SHORT_LABEL: Record<UserRole, string> = {
  FOUNDER: "CEO",
  CO_FOUNDER: "Associate",
  HOD: "Head",
  MANAGER: "Manager",
  TEAM_LEAD: "Lead",
  RESOURCE: "Member",
  ADMIN: "Admin",
  PERSON: "Person",
};

export type UserStatus = "ACTIVE" | "PENDING";

export type UserDTO = {
  id: string;
  name: string;
  /** The MAIN address: where invites and notifications go. */
  email: string;
  /** Every address that reaches this person, the main one first. */
  emails: string[];
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  disabledAt: string | null;
  emailOptIn: boolean;
  phone: string | null;
  whatsappOptIn: boolean;
  /** Where this person sits on the People page; null = "Not placed yet". */
  departmentId: string | null;
  departmentName: string | null;
  ownedProjectCount: number;
};

/** The signed-in account: a UserDTO plus what the chrome needs. */
export type MeDTO = UserDTO & {
  /** Owns (or monitors) a Person in Well Being — shows the Well Being tab. */
  hasFamily: boolean;
};

/** Palette offered when creating a project — tinted to sit on a light page. */
export const PROJECT_COLORS = [
  "#2dd4bf",
  "#eab308",
  "#f97316",
  "#a78bfa",
  "#38bdf8",
  "#f472b6",
  "#4ade80",
  "#f87171",
];

/** A department palette (phase 12). */
export const DEPARTMENT_COLORS = [
  "#0d9488",
  "#0369a1",
  "#7c3aed",
  "#c2410c",
  "#be123c",
  "#4d7c0f",
  "#a16207",
  "#475569",
];

/* Phase 35 — the family Routine feature v2. Client-safe DTOs (no server imports).
   The centerpiece is a SEGMENTED WEEKLY HABIT GRID: segments group habits, each
   habit carries a weekly target and a per-day three-state mark. */

/** A daily habit mark. "" (empty) means not yet marked. */
export type HabitMarkValue = "MET" | "MISSED" | "NA";

export type RoutinePersonDTO = { id: string; name: string; loginEmail: string };

/** One habit row in the grid: seven day-keyed marks + its weekly target/tally. */
export type HabitDTO = {
  id: string;
  segmentId: string;
  name: string;
  targetPerWeek: number;
  orderKey: string;
  active: boolean;
  /** dayKey ("YYYY-MM-DD") -> mark, only for the days actually marked this week. */
  marks: Record<string, HabitMarkValue>;
  /** Days marked MET within the shown week (0-7). */
  metThisWeek: number;
};

export type HabitSegmentDTO = {
  id: string;
  name: string;
  orderKey: string;
  habits: HabitDTO[];
  /** Sum of each habit's MET days, and the sum of targets, for the week. */
  metThisWeek: number;
  targetThisWeek: number;
};

export type NonNegotiableDTO = {
  id: string;
  name: string;
  orderKey: string;
  active: boolean;
  /** 2026-09-25 (the Family Routine Agreement): dayKey -> true ONLY on the days
      this line was CROSSED this week. Nothing is "done" — it holds every day. */
  days: Record<string, boolean>;
  /** Crossings logged this week. Should be 0. */
  crossedThisWeek: number;
  /** "MANAGER" = the parent side set it; "PERSON" = the person's own line. */
  addedBy: "MANAGER" | "PERSON";
};

export type RoutineTaskDTO = {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
  /** 2026-09-25: "MANAGER" = set by the parent side; "PERSON" = the person's own extra;
      "MENTOR" = homework a tutor set, due the day the tutor said. */
  addedBy: "MANAGER" | "PERSON" | "MENTOR";
  /** 2026-09-25: set when the task runs from this day to dueDate; null = one day (or any day). */
  startDate: string | null;
};

/* 2026-09-25 — the circle around the tracked person: the
   tutors' day reports, and the people invited in (a co-parent with the same Well
   Being on their own login, or a tutor/coach with one report screen). */

export type MentorReportDTO = {
  id: string;
  date: string;
  subject: string;
  mentorName: string;
  covered: string;
  homework: string | null;
  note: string | null;
  createdAt: string;
};

export type CircleKind = "FAMILY" | "MENTOR";
/** One person around the tracked person, for the owner's Circle panel. */
export type CircleMemberDTO = {
  id: string;
  userId: string;
  name: string;
  email: string;
  kind: CircleKind;
  /** MENTOR: what they teach or coach. */
  subject: string | null;
  /** FAMILY: what they may do in Well Being. Ignored for a MENTOR. */
  permission: RoutinePermission;
  /** "PENDING" = invited, has not set a password yet; "ACTIVE" = can sign in. */
  status: "PENDING" | "ACTIVE";
};
/** 2026-09-25 — the month calendar: one entry per day that has anything on it. */
export type CalendarDayDTO = {
  tasks: { id: string; title: string; done: boolean; addedBy: "MANAGER" | "PERSON" | "MENTOR" }[];
  reports: { id: string; subject: string; mentorName: string; covered: string; homework: string | null }[];
  /** Non-negotiables logged as crossed that day. */
  rules: { id: string; name: string; crossed: true }[];
  /** Habit marks that day — parent side only (the person never sees a rollup). */
  habits: { met: number; missed: number; total: number } | null;
};
export type CalendarMonthDTO = {
  /** "YYYY-MM" (IST). */
  month: string;
  today: string;
  /** dayKey -> what happened / is due that day. Days with nothing are absent. */
  days: Record<string, CalendarDayDTO>;
};

/* 2026-09-25 — maps: where the person was. A CHECKIN is their own tap (place,
   note, the phone's position if allowed); OWNTRACKS / OVERLAND are positions a
   location app on their phone posts by itself through the sharing link. */
/** CHECKIN = his tap; APP = the app noted it when he opened it or on the hour while
    open; OWNTRACKS / OVERLAND = a location app on his phone, through the sharing link. */
export type LocationSource = "CHECKIN" | "APP" | "OWNTRACKS" | "OVERLAND";

export type LocationPointDTO = {
  id: string;
  /** ISO instant. */
  at: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  battery: number | null;
  source: LocationSource;
  place: string | null;
  note: string | null;
  /** The place as the map knows it ("Mindspace, Madhapur"); "" = nothing there; null = not looked up yet. */
  placeName: string | null;
};
export type LocationDayDTO = {
  /** "YYYY-MM-DD" (IST). */
  day: string;
  /** That day's points, newest first. */
  points: LocationPointDTO[];
  /** The latest point ever, whatever the day. */
  lastSeen: LocationPointDTO | null;
  /** Phone sharing: on when a link exists; the link itself only for the owner. */
  sharing: { on: boolean; url: string | null };
};

/** Who a walled (PERSON-role) login is: the tracked person, a co-parent, or a tutor. */
export type WhoDTO = { kind: "SON" | "FAMILY" | "MENTOR"; name: string };
/** The mentor's own screen: each person they report on, with their past reports. */
export type MentorViewDTO = {
  name: string;
  today: string;
  students: { collaboratorId: string; personName: string; subject: string | null; reports: MentorReportDTO[] }[];
};

export type WeightEntryDTO = { id: string; date: string; weightKg: number };

/** One month's representative weight for the monthly trend. `month` is an IST
    "YYYY-MM"; `weightKg` is the LATEST entry logged within that month. */
export type MonthlyWeightDTO = { month: string; weightKg: number };

/** The seven IST day-keys (Mon..Sun) of the shown week, plus its Monday key. */
export type RoutineWeekDTO = { weekStart: string; days: string[] };

/* Phase 38 — the Weekly Summary. A PROJECTION of the same per-segment tallies the
   grid already shows (daysMet = segment.metThisWeek, target = segment.targetThisWeek)
   plus the overall totals and the week's non-negotiable violations. Not a parallel
   scoring calc — derived from the identical aggregation buildHabitGrid produces. */
export type RoutineSummarySegmentDTO = { id: string; name: string; daysMet: number; target: number };
export type RoutineSummaryDTO = {
  segments: RoutineSummarySegmentDTO[];
  overallDaysMet: number;
  overallTarget: number;
  /** Non-negotiable crossings logged this week — should be 0, addressed at once, not scored. */
  violations: number;
};

/* Phase 39 — routine collaboration. A manager reaches a routine as its OWNER
   (Person.managerId), an EDITABLE collaborator, or a READ_ONLY collaborator. */
export type RoutineRole = "OWNER" | "EDITABLE" | "READ_ONLY";
export type RoutinePermission = "READ_ONLY" | "EDITABLE";
/** One entry in the person/routine switcher (own person + accepted collaborations). */
export type RoutineSwitcherDTO = { personId: string; name: string; role: RoutineRole };
/** A pending routine invite, shown to the invited manager on Home. */
export type RoutineInviteDTO = {
  id: string;
  personName: string;
  ownerName: string;
  permission: RoutinePermission;
  invitedAt: string;
};
/** A monitoring manager, for the owner-only "Monitoring managers" panel. */
export type RoutineCollaboratorDTO = {
  id: string;
  managerId: string;
  managerName: string;
  managerEmail: string;
  permission: RoutinePermission;
  status: "PENDING" | "ACCEPTED";
};

export type RoutineOverviewDTO = {
  person: RoutinePersonDTO | null;
  today: string;
  week: RoutineWeekDTO;
  segments: HabitSegmentDTO[];
  nonNegotiables: NonNegotiableDTO[];
  tasks: RoutineTaskDTO[];
  weights: WeightEntryDTO[];
  /** Weight aggregated by IST calendar month (latest-in-month), most-recent last,
      capped to the last 12 months — the manager's cross-month progression. */
  monthlyWeights: MonthlyWeightDTO[];
  /** The Weekly Summary for the shown week (per-segment + overall + violations). */
  summary: RoutineSummaryDTO;
  /** The caller's role for the shown routine (null when there is no routine). */
  role: RoutineRole | null;
  /** Every routine the caller can open (own + accepted collaborations) — the switcher. */
  routines: RoutineSwitcherDTO[];
  /** Monitoring managers for THIS routine — populated for the OWNER only, else []. */
  collaborators: RoutineCollaboratorDTO[];
  /** 2026-09-25: today's tasks (due today or undated) whatever week is shown — the Today card. */
  todayTasks: RoutineTaskDTO[];
  /** 2026-09-25: the tutors' reports dated inside the shown week, newest first. */
  reports: MentorReportDTO[];
  /** 2026-09-25: the people around the person — OWNER only, else []. */
  circle: CircleMemberDTO[];
};

/* Phase 37 — the person's own habit grid on /kid. Same segments/habits + Mon–Sun
   marks the manager tracks, but WITHOUT the score (targets/met tallies): the person
   only marks, never sees the rollup. Non-negotiables, weight, and structure edits
   are never included here. */
export type PersonHabitDTO = { id: string; name: string; orderKey: string; marks: Record<string, HabitMarkValue> };
export type PersonHabitSegmentDTO = { id: string; name: string; orderKey: string; habits: PersonHabitDTO[] };

/** The person's own screen data — their habit grid (mark-only, no score) + tasks,
    plus any unread task reminder to surface. Never weight, non-negotiables,
    structure edits, or any work data. */
export type PersonViewDTO = {
  name: string;
  today: string;
  week: RoutineWeekDTO;
  segments: PersonHabitSegmentDTO[];
  tasks: RoutineTaskDTO[];
  /** The non-negotiables, read-only: dayKey -> true on days logged as crossed (2026-09-25). */
  nonNegotiables: { id: string; name: string; days: Record<string, boolean>; addedBy: "MANAGER" | "PERSON" }[];
  /** The latest unread task reminder (phase 39), shown once then marked read. */
  reminder: { title: string; body: string } | null;
  /** 2026-09-25: the latest tutor reports (homework). */
  reports: MentorReportDTO[];
};

/** The minimal grid shape the shared SegmentGrid renders. Score fields are
    optional so BOTH the manager (HabitSegmentDTO, with score) and the person
    (PersonHabitSegmentDTO, without) satisfy it — one component, no fork. */
export type GridHabit = { id: string; name: string; marks: Record<string, HabitMarkValue>; targetPerWeek?: number; metThisWeek?: number };
export type GridSegment = { id: string; name: string; habits: GridHabit[]; metThisWeek?: number; targetThisWeek?: number };
