import type { DateState } from "./dates";
import type { Gate } from "./gates";
import type { Role as AuthRole } from "./auth";

/*
 * ONE ARRAY PER SET. The type is derived from it, and lib/validation.ts
 * derives its zod enum from the same array.
 *
 * Standing law after phase 5 batch 1: a set written out twice is a set that
 * will eventually disagree with itself. TEAM_LEAD was added to a union and
 * not to a hand-written runtime check, and every team lead got 401 at sign-in
 * — the role existed in the type system and nowhere else. Status, Priority and
 * Health were each carrying the same three-copy risk.
 *
 * Status order is reading order, not database order. On hold sits between
 * in-progress and blocked: work that has started and stopped for a reason
 * nobody is at fault for, where blocked means something is in the way.
 */
export const STATUSES = [
  "BACKLOG",
  "PLANNED",
  "IN_PROGRESS",
  "ON_HOLD",
  "BLOCKED",
  "DONE",
  "CANCELLED",
] as const;
export type Status = (typeof STATUSES)[number];

/**
 * Sentence case, because these are read by people, not parsers.
 * lib/status.ts is the richer source; this stays for label-only callers.
 */
export const STATUS_LABEL: Record<Status, string> = {
  BACKLOG: "To do",
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  BLOCKED: "Stuck",
  DONE: "Completed",
  CANCELLED: "Cancelled",
};

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Task priority labels. The owner's company speaks P-numbers natively, so
    the labels ARE the values (phase 49 reverted a brief plain-language pass). */
export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
};

/** Phase 48: PROJECT-level priority — a separate, coarser axis than task
    priority, set by the chain and used to sort company/department dashboards. */
export const PROJECT_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type ProjectPriorityValue = (typeof PROJECT_PRIORITIES)[number];

/** The owner's call (phase 49): project priority reads as P1-P4 — the
    numbering their company already uses — with P1 the most urgent. The
    stored enum values are unchanged. */
export const PROJECT_PRIORITY_LABEL: Record<ProjectPriorityValue, string> = {
  CRITICAL: "P1",
  HIGH: "P2",
  MEDIUM: "P3",
  LOW: "P4",
};

/** Picker helper text — why you'd pick each level, in plain words. */
export const PROJECT_PRIORITY_HINT: Record<ProjectPriorityValue, string> = {
  CRITICAL: "Needs attention today",
  HIGH: "This week",
  MEDIUM: "Scheduled",
  LOW: "When time permits",
};

export const HEALTHS = ["ACTIVE", "PAUSED", "SHIPPED", "IDEA"] as const;
export type Health = (typeof HEALTHS)[number];

export const HEALTH_LABEL: Record<Health, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  SHIPPED: "Delivered",
  IDEA: "Idea",
};

export type LinkItem = { label: string; url: string };

/** Wire shape: dates are ISO strings once they cross the JSON boundary. */
export type TaskDTO = {
  id: string;
  /** Null for a PRIVATE personal task (phase 15) — it belongs to no project. */
  projectId: string | null;
  /** True for a PRIVATE personal task (phase 15): owned by one user, isolated. */
  isPrivate: boolean;
  /** The private task's owner (phase 15); null for a project task. */
  ownerId: string | null;
  /** The PersonalProject a private task lives in (phase 33); null for a project task. */
  personalProjectId: string | null;
  /** A GROUP_TINTS key painting a soft band behind this task + its subtree. */
  groupColor: string | null;
  parentId: string | null;
  title: string;
  descriptionMd: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  /** The server guessed this date; no human has confirmed it yet. */
  dueProvisional: boolean;
  orderKey: string;
  gates: Gate[];
  tags: string[];
  links: LinkItem[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  pinnedAt: string | null;
  deliverableUrl: string | null;
  completedById: string | null;
  /** Joined for display; null when nobody is recorded or the row was reopened. */
  completedByName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  /** A personal task colour; null = none. The tool colour is the identity cue. */
  color: string | null;
  /** Row-level hints that there is more inside, so nothing hides silently. */
  hasDescription: boolean;
  noteCount: number;
};

export type ProjectDTO = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string | null;
  health: Health;
  gateTemplate: Gate[];
  orderKey: string;
  createdAt: string;
  taskCount: number;
  description: string;
  /** Null on the tools that predate phase 5, until a manager assigns one. */
  leadId: string | null;
  leadName: string | null;
  /** The department this tool is filed under (phase 12). Null = unfiled. */
  departmentId: string | null;
  /** The manager who OWNS this tool (phase 14). Owner-only powers key off this. */
  ownerId: string | null;
  /** Phase 48: project priority — company/department dashboards sort by it. */
  priority: ProjectPriorityValue;
  /** Phase 48: when the project should finish (ISO), or null. */
  deadline: string | null;
};

/** A department / department of tools (phase 12; company-wide since phase 48). */
export type DepartmentDTO = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  orderKey: string;
  createdAt: string;
  /** Phase 48: what the department does, in plain language. */
  description: string;
  /** Phase 48: the Head of Department, or null when none is assigned. */
  hodId: string | null;
  hodName: string | null;
  /** How many tools THE CALLER CAN SEE are filed here — drives the sidebar's
      "hide empty departments for a team member" rule and the Home rollup line. */
  projectCount: number;
};

export type ProjectNoteDTO = {
  id: string;
  projectId: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: UserRole };
};

/** A project's people for the sidebar members popover (phase 17) — names only:
    the team lead, then the developer members. No ids, counts, or extra roles. */
export type ProjectTeamDTO = {
  name: string;
  lead: { name: string } | null;
  developers: { name: string }[];
};

/** A task on the calendar: its est-completion date, with the date-state and
    tool colour the chip needs. dateState reuses lib/dates (no parallel logic). */
export type CalendarTaskDTO = {
  id: string;
  title: string;
  dueDate: string;
  status: Status;
  dateState: DateState;
  dueProvisional: boolean;
  projectId: string;
  projectColor: string;
};

/** An invitee on a meeting (phase 22). userId lets the schedule/edit modal
    pre-check the box; name is what the day panel shows. */
export type MeetingAttendeeDTO = { userId: string; name: string };

export type CalendarEventDTO = {
  id: string;
  title: string;
  description: string;
  date: string;
  /** Meetings (phase 22): "HH:MM" 24h. null on a plain event. */
  startTime: string | null;
  endTime: string | null;
  isMeeting: boolean;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  isGlobal: boolean;
  /** The selected invitees — present (possibly empty) for a meeting, [] for a
      plain event. */
  attendees: MeetingAttendeeDTO[];
  createdById: string;
  createdByName: string;
  createdAt: string;
};

export type CalendarPayload = {
  tasks: CalendarTaskDTO[];
  events: CalendarEventDTO[];
};

export type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  readAt: string | null;
  createdAt: string;
  // Snooze (phase 23): an ISO time this item is hidden until, or null. Items in
  // the active list always carry null here; the separate `snoozed` list carries
  // future values for the "Snoozed (N)" section.
  snoozedUntil: string | null;
};

export const ROLES = ["FOUNDER", "DIRECTOR", "HOD", "MANAGER", "TEAM_LEAD", "RESOURCE", "ADMIN", "PERSON"] as const;
export type UserRole = (typeof ROLES)[number];

/* This list and lib/auth.ts's must stay identical: one decides what the UI
   offers, the other decides which session tokens are accepted at all. They
   live apart because auth.ts pulls in jose and has no business in a client
   bundle — so the invariant is enforced here instead, as a type error the
   moment they diverge. */
type _RolesMatch = AuthRole extends UserRole
  ? UserRole extends AuthRole
    ? true
    : never
  : never;
const _rolesMatch: _RolesMatch = true;
void _rolesMatch;

export const ROLE_LABEL: Record<UserRole, string> = {
  // Phase 48: the chain above MANAGER, top first.
  FOUNDER: "Founder",
  DIRECTOR: "Director",
  HOD: "Head of department",
  MANAGER: "Manager",
  TEAM_LEAD: "Team lead",
  // Phase 48 (renamed from DEVELOPER): "Team member" is the user-facing label —
  // friendlier than "Resource" and instantly understood by non-technical people.
  RESOURCE: "Team member",
  ADMIN: "Admin",
  // Phase 35 (renamed from CHILD): a walled-off login role, never offered in a
  // work picker (see ASSIGNABLE_ROLES) or shown in People — the label exists
  // only for completeness.
  PERSON: "Person",
};

/** A short chip label for tight spots (org chart pills, tables). */
export const ROLE_SHORT_LABEL: Record<UserRole, string> = {
  FOUNDER: "Founder",
  DIRECTOR: "Director",
  HOD: "HOD",
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
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  disabledAt: string | null;
  emailOptIn: boolean;
  /** WhatsApp (phase 32): E.164 number or null (no WhatsApp), and the per-person
      opt-in for the WhatsApp channel only. */
  phone: string | null;
  whatsappOptIn: boolean;
  /** How many projects this user OWNS (phase 14). Drives the delete-manager
      confirmation ("this permanently deletes N projects"). 0 for non-managers. */
  ownedProjectCount: number;
};

export type NoteDTO = {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: UserRole };
};

export type OverviewProject = {
  id: string;
  name: string;
  slug: string;
  color: string;
  health: Health;
  /** Leaf tasks, cancelled excluded from both halves of the ratio. */
  totalLeaves: number;
  doneLeaves: number;
  inFlight: number;
  blocked: number;
  doneThisWeek: number;
  /** Completions per day, oldest first, ending today. Always 14 entries. */
  sparkline: number[];
  nextUp: { id: string; title: string } | null;
  leadId: string | null;
  leadName: string | null;
  /** The department this tool is filed under (phase 12); null = unfiled. */
  departmentId: string | null;
  /** Phase 48: project priority + deadline, for chain dashboards. */
  priority: ProjectPriorityValue;
  deadline: string | null;
  /** Phase 49: what the project is for — the hover-expanded "about" line. */
  description: string;
  /** Every status, ON_HOLD included, so batch 2 can chart without recounting. */
  statusCounts: Record<Status, number>;
  /** Schedule health, computed server-side so every consumer agrees. */
  overdue: number;
  atRisk: number;
  unscheduled: number;
  perAssignee: Array<{
    userId: string | null;
    name: string;
    open: number;
    done: number;
  }>;
};

export type OverviewDTO = {
  projects: OverviewProject[];
  global: {
    shippedThisWeek: number;
    inFlight: number;
    blocked: number;
    overdue: number;
    atRisk: number;
    unscheduled: number;
    onHold: number;
  };
  /** Completions per ISO week, oldest first, ending this week (phase 12). */
  weeklyCompletions: number[];
  recent: Array<{
    id: string;
    title: string;
    projectId: string;
    completedAt: string;
  }>;
};

/** Palette offered when creating a tool — the tool palette, tinted to sit on a light page. */
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

/**
 * A separate, quieter palette for a task's personal colour (phase 11). It is a
 * marker someone puts on their own row — never the identity of the task, which
 * the tool's colour already carries — so the swatches sit a shade softer than
 * the tool palette and are chosen to read as a dot, not a fill.
 */
export const TASK_COLORS = [
  "#f87171",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#22d3ee",
  "#60a5fa",
  "#c084fc",
  "#f472b6",
];

/**
 * A department palette for departments (phase 12). Deeper, more saturated than the
 * tool palette so a department header reads as the container it is and never gets
 * mistaken for one of the tools sitting inside it.
 */
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
  /** dayKey -> done. A key is present ONLY on days the manager scheduled the rule
      as REQUIRED (this week); the value is whether the PERSON has marked it done. */
  days: Record<string, boolean>;
  /** Days the manager scheduled this week. */
  requiredThisWeek: number;
  /** Scheduled days the person has marked done. */
  doneThisWeek: number;
  /** Scheduled days already past (before today) that were left undone. */
  missedThisWeek: number;
};

export type RoutineTaskDTO = {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
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
  /** Scheduled non-negotiable days already past that were left undone, this week. */
  missed: number;
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
  /** House rules the person marks DONE per day (phase 42). Only rules the manager
      SCHEDULED for this week appear, each with its required days -> done. The person
      toggles `done` on those days only (they can't change which days are required).
      NO score / missed count reaches this side (kept calm, not a scoreboard). */
  nonNegotiables: { id: string; name: string; days: Record<string, boolean> }[];
  /** The latest unread task reminder (phase 39), shown once then marked read. */
  reminder: { title: string; body: string } | null;
};

/** The minimal grid shape the shared SegmentGrid renders. Score fields are
    optional so BOTH the manager (HabitSegmentDTO, with score) and the person
    (PersonHabitSegmentDTO, without) satisfy it — one component, no fork. */
export type GridHabit = { id: string; name: string; marks: Record<string, HabitMarkValue>; targetPerWeek?: number; metThisWeek?: number };
export type GridSegment = { id: string; name: string; habits: GridHabit[]; metThisWeek?: number; targetThisWeek?: number };
