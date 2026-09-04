import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { istDayKey } from "@/lib/timezone";
import { notifyUsers } from "@/lib/notify";
import type {
  HabitMarkValue,
  HabitSegmentDTO,
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
  HabitDTO,
  HabitMarkValue,
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
  {
    name: "Sleep & Wake",
    habits: [
      { name: "In bed by target time", targetPerWeek: 7 },
      { name: "Woke up on time", targetPerWeek: 7 },
    ],
  },
  {
    name: "Health & Body",
    habits: [
      { name: "Exercise / movement", targetPerWeek: 5 },
      { name: "Ate well", targetPerWeek: 7 },
      { name: "Water intake", targetPerWeek: 7 },
    ],
  },
  {
    name: "Academics / Work",
    habits: [
      { name: "Focused study / work", targetPerWeek: 6 },
      { name: "Homework / tasks done", targetPerWeek: 7 },
    ],
  },
  {
    name: "Mind & Screens",
    habits: [
      { name: "Reading", targetPerWeek: 5 },
      { name: "Screen-time limit kept", targetPerWeek: 7 },
      { name: "Quiet / calm time", targetPerWeek: 5 },
    ],
  },
];

/* ── Ownership guards: every mutation is scoped to the manager's OWN person. ─ */

/** The manager's own person, or null. One per manager (Person.managerId unique). */
export async function getManagerPerson(managerId: string) {
  return prisma.person.findUnique({
    where: { managerId },
    select: { id: true, name: true, userId: true, user: { select: { email: true } } },
  });
}
/** The manager's own person or a 404 — used by every routine mutation. */
export async function requireOwnPerson(managerId: string) {
  const person = await getManagerPerson(managerId);
  if (!person) throw new HttpError(404, "No person yet.");
  return person;
}
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

/** The person's own non-negotiables for one week (phase 42): ONLY the rules the
    manager scheduled for this week, each with its required days -> done, so the
    person can mark them done. A day is present only if the manager required it; the
    value is whether it's done. Rules with nothing scheduled this week are omitted. */
export async function buildPersonNonNegotiables(
  personId: string,
  mondayKey: string,
): Promise<{ id: string; name: string; days: Record<string, boolean> }[]> {
  const days = weekDays(mondayKey);
  const rules = await prisma.nonNegotiable.findMany({
    where: { personId, active: true },
    orderBy: { orderKey: "asc" },
    select: { id: true, name: true },
  });
  if (rules.length === 0) return [];
  const marks = await prisma.nonNegotiableMark.findMany({
    where: { nonNegotiableId: { in: rules.map((r) => r.id) }, date: { gte: dayKeyToDate(days[0]), lte: dayKeyToDate(days[6]) } },
    select: { nonNegotiableId: true, date: true, done: true },
  });
  const daysByNn = new Map<string, Record<string, boolean>>();
  for (const m of marks) {
    const rec = daysByNn.get(m.nonNegotiableId) ?? {};
    rec[dateToKey(m.date)] = m.done;
    daysByNn.set(m.nonNegotiableId, rec);
  }
  // Only surface rules the manager actually scheduled this week.
  return rules
    .map((r) => ({ id: r.id, name: r.name, days: daysByNn.get(r.id) ?? {} }))
    .filter((r) => Object.keys(r.days).length > 0);
}
/** A weight entry that belongs to the manager's own person, or 404. */
export async function requireOwnWeight(personId: string, id: string) {
  const w = await prisma.weightEntry.findFirst({ where: { id, personId }, select: { id: true } });
  if (!w) throw new HttpError(404, "Not found.");
  return w;
}

/* ── Phase 39 — the ONE routine access resolver (owner / editable / read-only /
      none). A manager reaches a routine if they OWN the person (Person.managerId)
      OR are an ACCEPTED collaborator; the granted permission decides read vs write.
      Every routine endpoint funnels through requireRoutineAccess — no parallel
      relationship checks anywhere else. Admin/lead/dev never reach here (the
      endpoints gate on requireManager first). ────────────────────────────────── */

export type PersonRef = { id: string; name: string; userId: string; user: { email: string } };
const PERSON_SELECT = { id: true, name: true, userId: true, user: { select: { email: true } } } as const;

/** Every routine the caller can see: their OWN person (OWNER, if any) followed by
    each ACCEPTED collaboration at its granted permission. The switcher list too. */
export async function getAccessibleRoutines(callerId: string): Promise<{ person: PersonRef; role: RoutineRole }[]> {
  const [own, collabs] = await Promise.all([
    prisma.person.findUnique({ where: { managerId: callerId }, select: PERSON_SELECT }),
    prisma.routineCollaborator.findMany({
      where: { managerId: callerId, status: "ACCEPTED" },
      select: { permission: true, person: { select: PERSON_SELECT } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const out: { person: PersonRef; role: RoutineRole }[] = [];
  if (own) out.push({ person: own, role: "OWNER" });
  for (const c of collabs) out.push({ person: c.person, role: c.permission === "EDITABLE" ? "EDITABLE" : "READ_ONLY" });
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
    where: { personId: person.id, done: false, OR: [{ dueDate: null }, { dueDate: today }] },
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

export function serializeTask(t: { id: string; title: string; dueDate: Date | null; done: boolean; doneAt: Date | null }): RoutineTaskDTO {
  return {
    id: t.id,
    title: t.title,
    dueDate: t.dueDate ? dateToKey(t.dueDate) : null,
    done: t.done,
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
  };
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
): Promise<Omit<RoutineOverviewDTO, "today" | "role" | "routines" | "collaborators">> {
  const days = weekDays(mondayKey);
  const startDate = dayKeyToDate(days[0]);
  const endDate = dayKeyToDate(days[6]);

  const [segmentsDto, nonNegotiables, tasks, weights] = await Promise.all([
    buildHabitGrid(person.id, mondayKey),
    prisma.nonNegotiable.findMany({
      where: { personId: person.id, active: true },
      orderBy: { orderKey: "asc" },
      select: { id: true, name: true, orderKey: true, active: true },
    }),
    // Phase 42: tasks are week-scoped — only those due in the viewed week, plus the
    // undated "any day" ones. Navigating weeks shows that week's tasks only.
    prisma.routineTask.findMany({
      where: { personId: person.id, OR: [{ dueDate: null }, { dueDate: { gte: startDate, lte: endDate } }] },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, dueDate: true, done: true, doneAt: true },
    }),
    prisma.weightEntry.findMany({
      where: { personId: person.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, date: true, weightKg: true },
    }),
  ]);

  const nnIds = nonNegotiables.map((n) => n.id);
  const nnMarks = nnIds.length
    ? await prisma.nonNegotiableMark.findMany({
        where: { nonNegotiableId: { in: nnIds }, date: { gte: startDate, lte: endDate } },
        select: { nonNegotiableId: true, date: true, done: true },
      })
    : [];

  // dayKey -> done for each rule; a key is present only on the manager's required days.
  const daysByNn = new Map<string, Record<string, boolean>>();
  for (const m of nnMarks) {
    const rec = daysByNn.get(m.nonNegotiableId) ?? {};
    rec[dateToKey(m.date)] = m.done;
    daysByNn.set(m.nonNegotiableId, rec);
  }
  const today = todayKey();

  const nonNegotiablesDto: NonNegotiableDTO[] = nonNegotiables.map((n) => {
    const dayMap = daysByNn.get(n.id) ?? {};
    const entries = Object.entries(dayMap);
    const doneThisWeek = entries.filter(([, done]) => done).length;
    // A scheduled day already past (before today) and still not done counts as missed.
    const missedThisWeek = entries.filter(([d, done]) => !done && d < today).length;
    return { id: n.id, name: n.name, orderKey: n.orderKey, active: n.active, days: dayMap, requiredThisWeek: entries.length, doneThisWeek, missedThisWeek };
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
  };
}

/** Project the Weekly Summary from the already-computed per-segment tallies +
    non-negotiable missed days. Pure — reuses the grid's aggregation, never recounts. */
export function summarizeWeek(segments: HabitSegmentDTO[], nonNegotiables: NonNegotiableDTO[]): RoutineSummaryDTO {
  return {
    segments: segments.map((s) => ({ id: s.id, name: s.name, daysMet: s.metThisWeek, target: s.targetThisWeek })),
    overallDaysMet: segments.reduce((a, s) => a + s.metThisWeek, 0),
    overallTarget: segments.reduce((a, s) => a + s.targetThisWeek, 0),
    missed: nonNegotiables.reduce((a, n) => a + n.missedThisWeek, 0),
  };
}
