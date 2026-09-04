/**
 * Estimated-completion dates: one owner for how a date is judged.
 *
 * The label is "Est. completion" everywhere it is shown to a person; the
 * column stays `dueDate`, because renaming a column across a live database to
 * win a word is not a trade worth making.
 *
 * Every surface that renders a date — tree, board, detail panel, focus — asks
 * this file what state it is in. Three places computing "is this late?" is how
 * they end up disagreeing.
 */
import type { Status } from "./types";

export const AT_RISK_DAYS = 3;

/** Days added when nothing better is known and a date is still required. */
export const AUTO_DATE_DAYS = 7;

export type DateState = "none" | "normal" | "at-risk" | "overdue";

/** Local midnight — comparisons are about calendar days, not instants. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysUntil(iso: string, now = new Date()): number {
  const then = startOfDay(new Date(iso));
  const today = startOfDay(now);
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Finished work is never late. A task that shipped last month against a date
 * two weeks earlier is history, not a problem, and painting it red buries the
 * things that are actually slipping.
 */
export function dateState(
  dueDate: string | null,
  status: Status,
  now = new Date(),
): DateState {
  if (!dueDate) return "none";
  if (status === "DONE" || status === "CANCELLED") return "normal";

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

/**
 * A guessed date still counts — it is in the at-risk and overdue maths exactly
 * like any other, because pretending a task has no deadline until someone
 * types one is how work goes untracked. It is only marked as guessed, with a
 * dashed edge and a leading "~", so nobody mistakes the tracker's arithmetic
 * for somebody's commitment.
 */
/* Plain `border-dashed`, no alpha modifier: Tailwind inherits currentColor
   for the border, which is already the chip's own -ink tone. `border-current/40`
   would have been another class that compiles to nothing. */
export const PROVISIONAL_RING = "border border-dashed";

export function dateLabel(
  iso: string,
  provisional: boolean,
  now = new Date(),
): string {
  const base = formatDate(iso, now);
  return provisional ? `~${base}` : base;
}

/**
 * The pill shown when a task predates the date requirement.
 *
 * Deliberately NOT amber. Every legacy row is dateless, so amber here painted
 * a whole tree the same colour as "at risk" and the distinction died — a
 * screen where everything is a warning contains no warnings. Missing a date is
 * an absence, so it is styled like one: neutral, dashed, quiet. Amber is
 * reserved for a real date that is running out.
 */
export const NO_DATE_STYLE = "border border-dashed border-line text-muted";

/**
 * Absolute calendar date as DD/MM/YYYY — day-first, zero-padded, no locale
 * guesswork. Every absolute date a person reads goes through here, so none of
 * them can render year-first or month-first.
 *
 * A date-only ISO string (YYYY-MM-DD) is split rather than parsed: new Date()
 * reads it as UTC midnight, which rolls back a day in any western timezone.
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

export function formatDate(iso: string, now = new Date()): string {
  const days = daysUntil(iso, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0 && days >= -6) return `${Math.abs(days)}d late`;
  if (days > 0 && days <= 6) {
    return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
  }
  return formatDMY(iso);
}

/** ISO date (no time) `n` days from now, for the auto-filled default. */
export function isoDaysFromNow(n: number, now = new Date()): string {
  const d = startOfDay(now);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/**
 * A child finishing after its parent is a scheduling contradiction, not an
 * error: the plan may simply not have caught up yet. It warns, never blocks.
 */
export function childOutlastsParent(
  childDue: string | null,
  parentDue: string | null,
): boolean {
  if (!childDue || !parentDue) return false;
  return startOfDay(new Date(childDue)) > startOfDay(new Date(parentDue));
}
