/**
 * Dates, in words. One owner for "is this late?", "what day is that?" and the
 * deadline chip's colour, so every screen agrees.
 */
import type { TaskStatus } from "./types";

export const AT_RISK_DAYS = 3;
/** Deadline chips turn amber inside this many days. */
export const DEADLINE_SOON_DAYS = 7;

export type DateState = "none" | "normal" | "at-risk" | "overdue";
export type DeadlineTone = "green" | "amber" | "red";

/** Local midnight — comparisons are about calendar days, not instants. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysUntil(iso: string, now = new Date()): number {
  const then = startOfDay(new Date(iso));
  const today = startOfDay(now);
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

/** Finished work is never late. */
export function dateState(dueDate: string | null, status: TaskStatus, now = new Date()): DateState {
  if (!dueDate) return "none";
  if (status === "DONE") return "normal";
  const days = daysUntil(dueDate, now);
  if (days < 0) return "overdue";
  if (days <= AT_RISK_DAYS) return "at-risk";
  return "normal";
}

/** Tailwind classes per state, in the soft-fill chip language. */
export const DATE_STATE_STYLE: Record<Exclude<DateState, "none">, string> = {
  normal: "bg-hover text-muted",
  "at-risk": "bg-warn-soft text-warn-ink",
  overdue: "bg-danger-soft text-danger-ink",
};

/** A project deadline chip: green, amber inside a week, red when passed. */
export function deadlineTone(deadline: string | null, done = false, now = new Date()): DeadlineTone | null {
  if (!deadline) return null;
  if (done) return "green";
  const days = daysUntil(deadline, now);
  if (days < 0) return "red";
  if (days < DEADLINE_SOON_DAYS) return "amber";
  return "green";
}

export const DEADLINE_TONE_STYLE: Record<DeadlineTone, string> = {
  green: "bg-ok-soft text-ok-ink",
  amber: "bg-warn-soft text-warn-ink",
  red: "bg-danger-soft text-danger-ink",
};

export const PROVISIONAL_RING = "border border-dashed";
export const NO_DATE_STYLE = "border border-dashed border-line text-muted";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Absolute calendar date as DD/MM/YYYY — kept for the few places (email
 * footers, tooltips) that want a full date. Everything a person reads on a
 * screen goes through `dateWord` instead.
 */
export function formatDMY(iso: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${d}/${m}/${y}`;
  }
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** "12 Sep", or "12 Sep 2027" when it is not this year. */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** "September 1" — the PROJECT START line. */
export function longDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const year = d.getFullYear() === now.getFullYear() ? "" : `, ${d.getFullYear()}`;
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}${year}`;
}

/**
 * Dates as words. Today / Tomorrow / Yesterday / a weekday inside the week /
 * "3 days late" / "12 Sep". This is the ONLY date format on rows and chips.
 */
export function dateWord(iso: string, now = new Date()): string {
  const days = daysUntil(iso, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0 && days >= -6) return `${Math.abs(days)} days late`;
  if (days > 0 && days <= 6) return WEEKDAYS[new Date(iso).getDay()];
  return shortDate(iso, now);
}

/** Back-compat name used by My notes' outline. */
export const formatDate = dateWord;

export function dateLabel(iso: string, provisional: boolean, now = new Date()): string {
  const base = dateWord(iso, now);
  return provisional ? `~${base}` : base;
}

/** ISO date (no time) `n` days from now. */
export function isoDaysFromNow(n: number, now = new Date()): string {
  const d = startOfDay(now);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/** "YYYY-MM-DD" of a local day, for date inputs. */
export function dayInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Same calendar day, local. */
export function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime();
}

export function childOutlastsParent(childDue: string | null, parentDue: string | null): boolean {
  if (!childDue || !parentDue) return false;
  return startOfDay(new Date(childDue)) > startOfDay(new Date(parentDue));
}
