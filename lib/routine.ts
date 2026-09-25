import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { istDayKey, istDayRange } from "@/lib/timezone";
import { getBaseUrl } from "@/lib/base-url";
import { namePoints } from "@/lib/geocode";
import { notifyUsers } from "@/lib/notify";
import type {
  CalendarDayDTO,
  CalendarMonthDTO,
  CircleMemberDTO,
  LocationDayDTO,
  LocationPointDTO,
  HabitMarkValue,
  HabitSegmentDTO,
  MentorReportDTO,
  MonthlyWeightDTO,
  NonNegotiableDTO,
  PersonHabitSegmentDTO,
  RoutineCollaboratorDTO,
  RoutineOverviewDTO,
  RoutinePermission,
  RoutineRole,
  RoutineSummaryDTO,
  RoutineTaskDTO,
  WeightEntryDTO,
} from "@/lib/types";

export type {
  CalendarDayDTO,
  CalendarMonthDTO,
  CircleKind,
  LocationDayDTO,
  LocationPointDTO,
  LocationSource,
  CircleMemberDTO,
  HabitDTO,
  HabitMarkValue,
  MentorReportDTO,
  MentorViewDTO,
  WhoDTO,
  HabitSegmentDTO,
  MonthlyWeightDTO,
  NonNegotiableDTO,
  PersonHabitSegmentDTO,
  RoutineCollaboratorDTO,
  RoutineOverviewDTO,
  RoutinePermission,
  RoutinePersonDTO,
  RoutineRole,
  RoutineSummaryDTO,
  RoutineSummarySegmentDTO,
  RoutineSwitcherDTO,
  RoutineTaskDTO,
  RoutineWeekDTO,
  WeightEntryDTO,
  PersonViewDTO,
} from "@/lib/types";

/** Aggregate weight entries by IST calendar month, representative = the LATEST
    entry in each month. Input MUST be ascending by date; returns most-recent-last,
    capped to the last `months` months. Pure/in-memory — no extra query. */
export function monthlyWeightTrend(weightsAsc: WeightEntryDTO[], months = 12): MonthlyWeightDTO[] {
  const byMonth = new Map<string, number>();
  for (const w of weightsAsc) byMonth.set(w.date.slice(0, 7), w.weightKg); // asc -> last write = latest-in-month
  return [...byMonth.entries()]
    .map(([month, weightKg]) => ({ month, weightKg }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    .slice(-months);
}

/* ── Dates: routine data is date-only in IST; keys are "YYYY-MM-DD". ───────── */

export function todayKey(): string {
  return istDayKey(new Date());
}
/** A "YYYY-MM-DD" key -> the UTC-midnight Date a @db.Date column stores. */
export function dayKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
/** A @db.Date value (UTC midnight) -> its "YYYY-MM-DD" key. */
export function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** The Monday (IST week start) of the week containing `dayKey`. */
export function weekStartKey(dayKey: string): string {
  const d = dayKeyToDate(dayKey);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat, stable because the key is UTC-midnight
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return dateToKey(d);
}
/** The seven day-keys Mon..Sun of the week starting at `mondayKey`. */
export function weekDays(mondayKey: string): string[] {
  const out: string[] = [];
  const d = dayKeyToDate(mondayKey);
  for (let i = 0; i < 7; i++) {
    out.push(dateToKey(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
/** Append a fractional orderKey after the current maximum among `keys`. */
export function appendOrderKey(keys: string[]): string {
  const last = keys.length ? keys.reduce((a, b) => (a > b ? a : b)) : null;
  try {
    return generateKeyBetween(last, null);
  } catch {
    return generateKeyBetween(null, null);
  }
}

/* ── The default grid seeded on person-create (fully editable afterward). ──── */

export const DEFAULT_SEGMENTS: { name: string; habits: { name: string; targetPerWeek: number }[] }[] = [
  // The owner's Family Routine Agreement, as its Weekly Routine Tracker sheet reads (2026-09-25).
  {
    name: "Sleep & Wake",
    habits: [
      { name: "In bed / phone away by 10:30 PM (school night)", targetPerWeek: 5 },
      { name: "Up by 6:15 AM without repeated wake-up calls", targetPerWeek: 5 },
      { name: "Leave the phone outside the bedroom overnight and do not access it while getting ready for school", targetPerWeek: 7 },
    ],
  },
  {
    name: "Screen Time & Media",
    habits: [
      { name: "Recreational screen time kept to 90 mins or less", targetPerWeek: 7 },
      { name: "No phone at the dinner table", targetPerWeek: 7 },
    ],
  },
  {
    name: "Academics",
    habits: [
      { name: "Checked grade portal / knew what was due", targetPerWeek: 7 },
      { name: "Completed the daily study block (min. 2 Hrs, school nights)", targetPerWeek: 5 },
    ],
  },
  {
    name: "Diet",
    habits: [
      { name: "No outside food ordered (or within the 2x/week plan)", targetPerWeek: 5 },
      { name: "No Diet Cokes", targetPerWeek: 7 },
    ],
  },
  {
    name: "Fitness",
    habits: [{ name: "Worked out / gym session completed", targetPerWeek: 4 }],
  },
  {
    name: "Social & Driving",
    habits: [
      { name: "2 Driving sessions over the weekend, not during the school days", targetPerWeek: 7 },
      { name: "Study block done before hanging out with friends", targetPerWeek: 7 },
    ],
  },
  {
    name: "Family Conduct",
    habits: [
      { name: "No fights with his sister", targetPerWeek: 7 },
      { name: "Stayed rational / no yelling during disagreements", targetPerWeek: 7 },
      { name: "Gave advance notice for schedule-change requests", targetPerWeek: 7 },
    ],
  },
];

/** The agreement's non-negotiables (section 8): fixed lines, logged only when crossed. */
export const DEFAULT_NON_NEGOTIABLES = [
  "No fights with his sister, ever",
  "Respectful language — no yelling, name-calling, slamming doors",
  "Seatbelt and safe driving practices, always",
  "Honesty about where he is and who he's with",
] as const;

/* ── Ownership guards: every mutation is scoped to the manager's OWN person. ─ */

// Which persons a caller owns is decided in one place: getOwnedPersons, below (2026-09-10).
/** A segment that belongs to the manager's own person, or 404. */
export async function requireOwnSegment(personId: string, segmentId: string) {
  const seg = await prisma.habitSegment.findFirst({ where: { id: segmentId, personId }, select: { id: true } });
  if (!seg) throw new HttpError(404, "Not found.");
  return seg;
}
/** A habit under the manager's own person (joined through its segment), or 404. */
export async function requireOwnHabit(personId: string, habitId: string) {
  const habit = await prisma.habit.findFirst({ where: { id: habitId, segment: { personId } }, select: { id: true, segmentId: true } });
  if (!habit) throw new HttpError(404, "Not found.");
  return habit;
}
/** A non-negotiable that belongs to the manager's own person, or 404. */
export async function requireOwnNonNegotiable(personId: string, id: string) {
  const nn = await prisma.nonNegotiable.findFirst({ where: { id, personId }, select: { id: true } });
  if (!nn) throw new HttpError(404, "Not found.");
  return nn;
}

/** The days each non-negotiable was logged as crossed in one week: ruleId -> dayKey -> true. */
async function crossedDaysByRule(ruleIds: string[], mondayKey: string): Promise<Map<string, Record<string, boolean>>> {
  const out = new Map<string, Record<string, boolean>>();
  if (ruleIds.length === 0) return out;
  const days = weekDays(mondayKey);
  const marks = await prisma.nonNegotiableMark.findMany({
    where: { nonNegotiableId: { in: ruleIds }, crossed: true, date: { gte: dayKeyToDate(days[0]), lte: dayKeyToDate(days[6]) } },
    select: { nonNegotiableId: true, date: true },
  });
  for (const m of marks) {
    const rec = out.get(m.nonNegotiableId) ?? {};
    rec[dateToKey(m.date)] = true;
    out.set(m.nonNegotiableId, rec);
  }
  return out;
}

/** The person's own non-negotiables for one week (2026-09-25, the Family Routine
    Agreement): every active line, read-only, with the days logged as crossed. */
export async function buildPersonNonNegotiables(
  personId: string,
  mondayKey: string,
): Promise<{ id: string; name: string; days: Record<string, boolean>; addedBy: "MANAGER" | "PERSON" }[]> {
  const rules = await prisma.nonNegotiable.findMany({
    where: { personId, active: true },
    orderBy: { orderKey: "asc" },
    select: { id: true, name: true, addedBy: true },
  });
  const crossed = await crossedDaysByRule(rules.map((r) => r.id), mondayKey);
  return rules.map((r) => ({ id: r.id, name: r.name, days: crossed.get(r.id) ?? {}, addedBy: r.addedBy === "PERSON" ? "PERSON" : "MANAGER" }));
}
/** A weight entry that belongs to the manager's own person, or 404. */
export async function requireOwnWeight(personId: string, id: string) {
  const w = await prisma.weightEntry.findFirst({ where: { id, personId }, select: { id: true } });
  if (!w) throw new HttpError(404, "Not found.");
  return w;
}

/* ── Phase 39 — the ONE routine access resolver (owner / editable / read-only /
      none). A manager reaches a routine if they OWN the person (getOwnedPersons)
      OR are an ACCEPTED collaborator; the granted permission decides read vs write.
      Every routine endpoint funnels through requireRoutineAccess — no parallel
      relationship checks anywhere else. Admin/lead/dev never reach here (the
      endpoints gate on requireManager first). ────────────────────────────────── */

export type PersonRef = { id: string; name: string; userId: string; user: { email: string } };
const PERSON_SELECT = { id: true, name: true, userId: true, user: { select: { email: true } } } as const;

/** The persons the caller runs as OWNER: their own (Person.managerId). A CEO with
    none of his own also runs every person whose manager is not a CEO (2026-09-10).
    Well Being has been the CEO's alone since 2026-09-04, so nobody else can open
    those; on the live site the one person still belongs to a manager. Worked out
    on every read: nobody is reassigned. Oldest first. */
export async function getOwnedPersons(callerId: string): Promise<PersonRef[]> {
  const caller = await prisma.user.findUnique({
    where: { id: callerId },
    select: { role: true, managedPerson: { select: PERSON_SELECT } },
  });
  if (!caller) return [];
  if (caller.managedPerson) return [caller.managedPerson];
  if (caller.role !== "FOUNDER") return [];
  return prisma.person.findMany({
    where: { manager: { role: { not: "FOUNDER" } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: PERSON_SELECT,
  });
}

/** Every routine the caller can see: the persons they run as OWNER (above)
    followed by each ACCEPTED collaboration at its granted permission. The
    switcher list too. */
export async function getAccessibleRoutines(callerId: string): Promise<{ person: PersonRef; role: RoutineRole }[]> {
  const [owned, collabs] = await Promise.all([
    getOwnedPersons(callerId),
    // A tutor's row (kind MENTOR) opens nothing here — only the one report screen.
    prisma.routineCollaborator.findMany({
      where: { managerId: callerId, status: "ACCEPTED", kind: "FAMILY" },
      select: { permission: true, person: { select: PERSON_SELECT } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const out: { person: PersonRef; role: RoutineRole }[] = owned.map((person) => ({ person, role: "OWNER" as const }));
  for (const c of collabs) {
    // A person the caller runs as owner is not listed again as a collaboration (2026-09-10).
    if (out.some((r) => r.person.id === c.person.id)) continue;
    out.push({ person: c.person, role: c.permission === "EDITABLE" ? "EDITABLE" : "READ_ONLY" });
  }
  return out;
}

/** Resolve the caller's access to a SPECIFIC person's routine (or their default
    when personId is null), enforcing write / owner-only. Owner OR accepted
    collaborator, else 404 (isolation intact). READ_ONLY on a write -> 403;
    non-owner on an owner-only action -> 403. */
export async function requireRoutineAccess(
  callerId: string,
  personId: string | null,
  opts: { write?: boolean; ownerOnly?: boolean } = {},
): Promise<{ person: PersonRef; role: RoutineRole }> {
  const routines = await getAccessibleRoutines(callerId);
  const match = personId ? routines.find((r) => r.person.id === personId) : routines[0];
  if (!match) throw new HttpError(404, "No Well Being here.");
  if (opts.ownerOnly && match.role !== "OWNER") throw new HttpError(403, "Only the Well Being owner can do this.");
  if (opts.write && match.role === "READ_ONLY") throw new HttpError(403, "You have read-only access to this Well Being.");
  return match;
}

/** Read the `?person=<id>` selector off a request URL (null when absent). */
export function personParam(req: Request): string | null {
  return new URL(req.url).searchParams.get("person");
}

/** The monitoring managers on a routine (for the owner's panel) — every
    collaborator row, PENDING and ACCEPTED, newest last. */
export async function listRoutineCollaborators(personId: string): Promise<RoutineCollaboratorDTO[]> {
  const rows = await prisma.routineCollaborator.findMany({
    where: { personId },
    orderBy: { createdAt: "asc" },
    select: { id: true, managerId: true, permission: true, status: true, manager: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    managerId: r.managerId,
    managerName: r.manager.name,
    managerEmail: r.manager.email,
    permission: r.permission as RoutinePermission,
    status: r.status as "PENDING" | "ACCEPTED",
  }));
}

/* ── Phase 39 — task reminders. One reminder per person per cooldown window. ─── */

export const REMINDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes — don't spam.

export type RemindResult =
  | { sent: true; count: number }
  | { sent: false; reason: "none" }
  | { sent: false; reason: "rate_limited"; retryInMs: number };

/**
 * Find a person's UNDONE tasks (today or undated) and, if any, remind them — a
 * durable in-app Notification on their login PLUS a best-effort push (notifyUsers
 * does both). Rate-limited to one reminder per person per REMINDER_COOLDOWN_MS.
 * Sends NOTHING when there are no pending tasks (no empty reminder).
 *
 * AUTO-SEAM: this is the whole "who to remind + what to send" unit. A future cron
 * (e.g. GET /api/cron/routine-reminders, CRON_SECRET-gated, per-routine reminder
 * time) can iterate persons with undone tasks and call remindPerson() — no logic
 * duplicated. Do NOT enable a schedule here; only the manual endpoint calls it now.
 */
export async function remindPerson(person: { id: string; userId: string }): Promise<RemindResult> {
  const today = dayKeyToDate(todayKey());
  const undone = await prisma.routineTask.findMany({
    where: { personId: person.id, done: false, ...tasksOnDay(today) },
    orderBy: { createdAt: "asc" },
    select: { title: true },
  });
  if (undone.length === 0) return { sent: false, reason: "none" };

  const recent = await prisma.notification.findFirst({
    where: { userId: person.userId, type: "routine.reminder", createdAt: { gte: new Date(Date.now() - REMINDER_COOLDOWN_MS) } },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return { sent: false, reason: "rate_limited", retryInMs: REMINDER_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime()) };

  const preview = undone.slice(0, 2).map((t) => t.title).join(", ");
  const extra = undone.length > 2 ? ` +${undone.length - 2} more` : "";
  await notifyUsers([person.userId], {
    type: "routine.reminder",
    title: `Reminder: ${undone.length} ${undone.length === 1 ? "task" : "tasks"} to do`,
    body: `${preview}${extra}`,
    url: "/person",
    tag: "routine-reminder",
  });
  return { sent: true, count: undone.length };
}

/** The columns every task read selects — keep the reads and this DTO in step. */
export const TASK_SELECT = { id: true, title: true, dueDate: true, startDate: true, done: true, doneAt: true, addedBy: true } as const;

export function serializeTask(t: { id: string; title: string; dueDate: Date | null; startDate: Date | null; done: boolean; doneAt: Date | null; addedBy: string }): RoutineTaskDTO {
  return {
    id: t.id,
    title: t.title,
    dueDate: t.dueDate ? dateToKey(t.dueDate) : null,
    startDate: t.startDate ? dateToKey(t.startDate) : null,
    done: t.done,
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
    addedBy: t.addedBy === "PERSON" ? "PERSON" : t.addedBy === "MENTOR" ? "MENTOR" : "MANAGER",
  };
}

/** The tasks that stand on one day: any-day ones, the ones due that day, and the
    ones running from a start day to a due day across it (2026-09-25). */
export function tasksOnDay(day: Date) {
  return { OR: [{ dueDate: null }, { dueDate: day }, { startDate: { lte: day }, dueDate: { gte: day } }] };
}
/** The tasks that touch a span of days: any-day ones, due inside it, or running across it. */
export function tasksInSpan(start: Date, end: Date) {
  return { OR: [{ dueDate: null }, { dueDate: { gte: start, lte: end } }, { startDate: { lte: end }, dueDate: { gte: start } }] };
}

/* ── 2026-09-25 — the circle: the tutors' reports, and
      the people around the person. Read-only builders; the routes write. ───── */

/** "YYYY-MM-DD" -> "YYYY-MM". */
export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}
/** The first and last day-keys of a "YYYY-MM" month. */
export function monthDays(monthKey: string): { first: string; last: string } {
  const first = `${monthKey}-01`;
  const d = dayKeyToDate(first);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0); // the last day of monthKey
  return { first, last: dateToKey(d) };
}
/** A "YYYY-MM" month key, or null when the string is not one. */
export function parseMonthKey(v: string | null): string | null {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

const REPORT_SELECT = {
  id: true,
  date: true,
  subject: true,
  covered: true,
  homework: true,
  note: true,
  createdAt: true,
  collaborator: { select: { manager: { select: { name: true } } } },
} as const;
export function serializeReport(r: {
  id: string;
  date: Date;
  subject: string;
  covered: string;
  homework: string | null;
  note: string | null;
  createdAt: Date;
  collaborator: { manager: { name: string } };
}): MentorReportDTO {
  return {
    id: r.id,
    date: dateToKey(r.date),
    subject: r.subject,
    mentorName: r.collaborator.manager.name,
    covered: r.covered,
    homework: r.homework,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

/** The reports dated inside [fromKey, toKey], newest first. */
export async function listReportsBetween(personId: string, fromKey: string, toKey: string): Promise<MentorReportDTO[]> {
  const rows = await prisma.mentorReport.findMany({
    where: { personId, date: { gte: dayKeyToDate(fromKey), lte: dayKeyToDate(toKey) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: REPORT_SELECT,
  });
  return rows.map(serializeReport);
}
/** The latest `n` reports, newest first — the person's "from your tutors". */
export async function listLatestReports(personId: string, n: number): Promise<MentorReportDTO[]> {
  const rows = await prisma.mentorReport.findMany({
    where: { personId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: n,
    select: REPORT_SELECT,
  });
  return rows.map(serializeReport);
}

const CIRCLE_SELECT = {
  id: true,
  managerId: true,
  kind: true,
  subject: true,
  permission: true,
  manager: { select: { name: true, email: true, status: true } },
} as const;
export function serializeCircleMember(c: {
  id: string;
  managerId: string;
  kind: string;
  subject: string | null;
  permission: string;
  manager: { name: string; email: string; status: string };
}): CircleMemberDTO {
  return {
    id: c.id,
    userId: c.managerId,
    name: c.manager.name,
    email: c.manager.email,
    kind: c.kind === "MENTOR" ? "MENTOR" : "FAMILY",
    subject: c.subject,
    permission: c.permission === "EDITABLE" ? "EDITABLE" : "READ_ONLY",
    status: c.manager.status === "PENDING" ? "PENDING" : "ACTIVE",
  };
}
/** Everyone the owner invited around this person (co-parents and tutors), oldest first. */
export async function listCircle(personId: string): Promise<CircleMemberDTO[]> {
  // Only walled logins made from the Circle: a phase-39 monitoring MANAGER row
  // (kind defaults to FAMILY) is not a co-parent and never shows here.
  const rows = await prisma.routineCollaborator.findMany({
    where: { personId, status: "ACCEPTED", manager: { role: "PERSON" } },
    orderBy: { createdAt: "asc" },
    select: CIRCLE_SELECT,
  });
  return rows.map(serializeCircleMember);
}
/** The month calendar (2026-09-25): every dated thing about the person in one
    "YYYY-MM" month, keyed by day — tasks by due day, tutor reports, the
    rules scheduled that day, and (parent side only) the day's habit marks. Days
    with nothing on them are left out so the grid can dot only what matters. */
export async function buildCalendarMonth(personId: string, monthKey: string, opts: { withHabits: boolean }): Promise<CalendarMonthDTO> {
  const { first, last } = monthDays(monthKey);
  const start = dayKeyToDate(first);
  const end = dayKeyToDate(last);
  const [tasks, reports, ruleMarks, habitMarks] = await Promise.all([
    prisma.routineTask.findMany({
      where: { personId, OR: [{ dueDate: { gte: start, lte: end } }, { startDate: { lte: end }, dueDate: { gte: start } }] },
      orderBy: [{ done: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, done: true, addedBy: true, dueDate: true, startDate: true },
    }),
    prisma.mentorReport.findMany({
      where: { personId, date: { gte: start, lte: end } },
      orderBy: { createdAt: "asc" },
      select: { id: true, date: true, subject: true, covered: true, homework: true, collaborator: { select: { manager: { select: { name: true } } } } },
    }),
    prisma.nonNegotiableMark.findMany({
      where: { nonNegotiable: { personId, active: true }, crossed: true, date: { gte: start, lte: end } },
      orderBy: { nonNegotiable: { orderKey: "asc" } },
      select: { date: true, nonNegotiable: { select: { id: true, name: true } } },
    }),
    opts.withHabits
      ? prisma.habitMark.findMany({
          where: { habit: { active: true, segment: { personId } }, date: { gte: start, lte: end } },
          select: { date: true, value: true },
        })
      : Promise.resolve([] as { date: Date; value: string }[]),
  ]);
  const days: Record<string, CalendarDayDTO> = {};
  const day = (d: Date): CalendarDayDTO => {
    const k = dateToKey(d);
    return (days[k] ??= { tasks: [], reports: [], rules: [], habits: null });
  };
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const row = { id: t.id, title: t.title, done: t.done, addedBy: t.addedBy === "PERSON" ? ("PERSON" as const) : t.addedBy === "MENTOR" ? ("MENTOR" as const) : ("MANAGER" as const) };
    // A task that runs over several days stands on each of them (inside this month).
    const from = t.startDate && t.startDate < t.dueDate ? (t.startDate > start ? t.startDate : start) : t.dueDate;
    const to = t.dueDate < end ? t.dueDate : end;
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) day(d).tasks.push(row);
  }
  for (const r of reports) day(r.date).reports.push({ id: r.id, subject: r.subject, mentorName: r.collaborator.manager.name, covered: r.covered, homework: r.homework });
  for (const r of ruleMarks) day(r.date).rules.push({ id: r.nonNegotiable.id, name: r.nonNegotiable.name, crossed: true });
  if (opts.withHabits) {
    for (const h of habitMarks) {
      const d = day(h.date);
      d.habits ??= { met: 0, missed: 0, total: 0 };
      d.habits.total += 1;
      if (h.value === "MET") d.habits.met += 1;
      else if (h.value === "MISSED") d.habits.missed += 1;
    }
  }
  return { month: monthKey, today: todayKey(), days };
}

/* ── 2026-09-25 — maps: check-ins and the phone's posted positions. ─────────── */

/** The places offered on the person's Check in card. "Other" opens a free text. */
export const CHECKIN_PLACES = ["Home", "School", "Tutor", "Tennis", "Other"] as const;

const LOCATION_SELECT = { id: true, at: true, lat: true, lng: true, accuracy: true, battery: true, source: true, place: true, note: true, placeName: true } as const;

export function serializeLocation(
  p: { id: string; at: Date; lat: number; lng: number; accuracy: number | null; battery: number | null; source: string; place: string | null; note: string | null; placeName: string | null },
): LocationPointDTO {
  return {
    id: p.id,
    at: p.at.toISOString(),
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    battery: p.battery,
    source: p.source === "OWNTRACKS" ? "OWNTRACKS" : p.source === "OVERLAND" ? "OVERLAND" : p.source === "APP" ? "APP" : "CHECKIN",
    place: p.place,
    note: p.note,
    placeName: p.placeName,
  };
}
/** One IST day of positions (newest first), the latest point ever, and whether
    phone sharing is on — with the sharing link only when `withUrl` (the owner). */
export async function buildLocationDay(personId: string, dayKey: string, opts: { withUrl: boolean }): Promise<LocationDayDTO> {
  const { start, end } = istDayRange(dayKey);
  const [points, last, person] = await Promise.all([
    prisma.locationPoint.findMany({ where: { personId, at: { gte: start, lte: end } }, orderBy: { at: "desc" }, take: 2000, select: LOCATION_SELECT }),
    prisma.locationPoint.findFirst({ where: { personId }, orderBy: { at: "desc" }, select: LOCATION_SELECT }),
    prisma.person.findUnique({ where: { id: personId }, select: { feedToken: true } }),
  ]);
  const token = person?.feedToken ?? null;
  // The map's names arrive a few at a time (the free lookup is one a second): the
  // latest point first, then the day's newest, so the log fills in from the top.
  const named = await namePoints([...(last ? [last] : []), ...points], 3);
  const withName = <T extends { id: string; placeName: string | null }>(p: T): T => (named.has(p.id) ? { ...p, placeName: named.get(p.id)! } : p);
  return {
    day: dayKey,
    points: points.map((p) => serializeLocation(withName(p))),
    lastSeen: last ? serializeLocation(withName(last)) : null,
    sharing: { on: Boolean(token), url: token && opts.withUrl ? `${getBaseUrl()}/api/routine/feed/${token}` : null },
  };
}

/** A "YYYY-MM-DD" day key, or null when the string is not one. */
export function parseDayKey(v: string | null): string | null {
  // The shape, then the round trip: "2026-13-45" is not a day (review, 2026-09-25).
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && dateToKey(dayKeyToDate(v)) === v ? v : null;
}

/** A circle row that belongs to this person, or 404. */
export async function requireCircleMember(personId: string, id: string) {
  const row = await prisma.routineCollaborator.findFirst({ where: { id, personId, status: "ACCEPTED", manager: { role: "PERSON" } }, select: CIRCLE_SELECT });
  if (!row) throw new HttpError(404, "Not found.");
  return row;
}

/* ── The habit grid for one person + week — shared by the manager overview AND
      the person's own /kid view (build once, don't fork). Returns the full
      HabitSegmentDTO incl. per-habit/segment tallies; the person view drops the
      score before serving (see toPersonSegments). ─────────────────────────── */

export async function buildHabitGrid(personId: string, mondayKey: string): Promise<HabitSegmentDTO[]> {
  const days = weekDays(mondayKey);
  const startDate = dayKeyToDate(days[0]);
  const endDate = dayKeyToDate(days[6]);

  const segments = await prisma.habitSegment.findMany({
    where: { personId },
    orderBy: { orderKey: "asc" },
    select: {
      id: true,
      name: true,
      orderKey: true,
      habits: {
        where: { active: true },
        orderBy: { orderKey: "asc" },
        select: { id: true, name: true, targetPerWeek: true, orderKey: true, active: true },
      },
    },
  });

  const habitIds = segments.flatMap((s) => s.habits.map((h) => h.id));
  const habitMarks = habitIds.length
    ? await prisma.habitMark.findMany({
        where: { habitId: { in: habitIds }, date: { gte: startDate, lte: endDate } },
        select: { habitId: true, date: true, value: true },
      })
    : [];

  const marksByHabit = new Map<string, Record<string, HabitMarkValue>>();
  for (const m of habitMarks) {
    const rec = marksByHabit.get(m.habitId) ?? {};
    rec[dateToKey(m.date)] = m.value as HabitMarkValue;
    marksByHabit.set(m.habitId, rec);
  }

  return segments.map((s) => {
    const habits = s.habits.map((h) => {
      const marks = marksByHabit.get(h.id) ?? {};
      const metThisWeek = Object.values(marks).filter((v) => v === "MET").length;
      return { id: h.id, segmentId: s.id, name: h.name, targetPerWeek: h.targetPerWeek, orderKey: h.orderKey, active: h.active, marks, metThisWeek };
    });
    return {
      id: s.id,
      name: s.name,
      orderKey: s.orderKey,
      habits,
      metThisWeek: habits.reduce((a, h) => a + h.metThisWeek, 0),
      targetThisWeek: habits.reduce((a, h) => a + h.targetPerWeek, 0),
    };
  });
}

/** Strip the SCORE (targets + met tallies) so the person sees only their habits
    and their own marks — never the weekly rollup numbers (owner requirement). */
export function toPersonSegments(segments: HabitSegmentDTO[]): PersonHabitSegmentDTO[] {
  return segments.map((s) => ({
    id: s.id,
    name: s.name,
    orderKey: s.orderKey,
    habits: s.habits.map((h) => ({ id: h.id, name: h.name, orderKey: h.orderKey, marks: h.marks })),
  }));
}

/* ── The overview builder: the whole calm manager view for one week. ──────── */

export async function buildOverview(
  person: { id: string; name: string; user: { email: string } },
  mondayKey: string,
): Promise<Omit<RoutineOverviewDTO, "today" | "role" | "routines" | "collaborators" | "circle">> {
  const days = weekDays(mondayKey);
  const startDate = dayKeyToDate(days[0]);
  const endDate = dayKeyToDate(days[6]);

  const [segmentsDto, nonNegotiables, tasks, weights, reports, todayTasks] = await Promise.all([
    buildHabitGrid(person.id, mondayKey),
    prisma.nonNegotiable.findMany({
      where: { personId: person.id, active: true },
      orderBy: { orderKey: "asc" },
      select: { id: true, name: true, orderKey: true, active: true, addedBy: true },
    }),
    // Phase 42: tasks are week-scoped — only those due in the viewed week, plus the
    // undated "any day" ones. Navigating weeks shows that week's tasks only.
    prisma.routineTask.findMany({
      where: { personId: person.id, ...tasksInSpan(startDate, endDate) },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: TASK_SELECT,
    }),
    prisma.weightEntry.findMany({
      where: { personId: person.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, date: true, weightKg: true },
    }),
    // The tutors' reports dated inside the shown week.
    listReportsBetween(person.id, days[0], days[6]),
    // Today's list, whatever week is being browsed (the Today card; review 2026-09-25).
    prisma.routineTask.findMany({
      where: { personId: person.id, ...tasksOnDay(dayKeyToDate(todayKey())) },
      orderBy: [{ done: "asc" }, { createdAt: "asc" }],
      select: TASK_SELECT,
    }),
  ]);

  // dayKey -> true on the days each line was logged as crossed this week (2026-09-25).
  const crossedByNn = await crossedDaysByRule(nonNegotiables.map((n) => n.id), mondayKey);
  const nonNegotiablesDto: NonNegotiableDTO[] = nonNegotiables.map((n) => {
    const dayMap = crossedByNn.get(n.id) ?? {};
    return { id: n.id, name: n.name, orderKey: n.orderKey, active: n.active, days: dayMap, crossedThisWeek: Object.keys(dayMap).length, addedBy: n.addedBy === "PERSON" ? "PERSON" : "MANAGER" };
  });

  // `weights` is already ordered ascending by date (the query), so the monthly
  // trend is derived in-memory — no second query, no N+1.
  const weightsDto: WeightEntryDTO[] = weights.map((w) => ({ id: w.id, date: dateToKey(w.date), weightKg: w.weightKg }));
  const monthlyWeights = monthlyWeightTrend(weightsDto);

  // The Weekly Summary is a PROJECTION of the tallies already computed above —
  // daysMet/target come straight from segmentsDto (buildHabitGrid's per-segment
  // metThisWeek/targetThisWeek), and violations sums nonNegotiablesDto. No second
  // pass over the marks, no parallel scoring calc.
  const summary = summarizeWeek(segmentsDto, nonNegotiablesDto);

  return {
    person: { id: person.id, name: person.name, loginEmail: person.user.email },
    week: { weekStart: mondayKey, days },
    segments: segmentsDto,
    nonNegotiables: nonNegotiablesDto,
    tasks: tasks.map(serializeTask),
    weights: weightsDto,
    monthlyWeights,
    summary,
    todayTasks: todayTasks.map(serializeTask),
    reports,
  };
}

/** Project the Weekly Summary from the already-computed per-segment tallies +
    non-negotiable missed days. Pure — reuses the grid's aggregation, never recounts. */
export function summarizeWeek(segments: HabitSegmentDTO[], nonNegotiables: NonNegotiableDTO[]): RoutineSummaryDTO {
  return {
    segments: segments.map((s) => ({ id: s.id, name: s.name, daysMet: s.metThisWeek, target: s.targetThisWeek })),
    overallDaysMet: segments.reduce((a, s) => a + s.metThisWeek, 0),
    overallTarget: segments.reduce((a, s) => a + s.targetThisWeek, 0),
    violations: nonNegotiables.reduce((a, n) => a + n.crossedThisWeek, 0),
  };
}
