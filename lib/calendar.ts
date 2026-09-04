/**
 * Pure calendar helpers. Days are bucketed by the VIEWER'S LOCAL calendar day —
 * the same local-day semantics lib/dates uses for task pills — so a task chip
 * and its calendar cell never disagree. One rule for tasks and events both.
 *
 * The month grid is Monday-first, matching the ISO-week convention used by the
 * overview's weekly chart.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Local "YYYY-MM-DD" for a Date. */
export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local "YYYY-MM-DD" for an ISO string. */
export function dayKey(iso: string): string {
  return dayKeyOf(new Date(iso));
}

export function isSameMonth(d: Date, year: number, month: number): boolean {
  return d.getFullYear() === year && d.getMonth() === month;
}

export function isToday(d: Date): boolean {
  return dayKeyOf(d) === dayKeyOf(new Date());
}

/** The Monday on or before `d` (local). */
function mondayOnOrBefore(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // 0 = Monday
  out.setDate(out.getDate() - dow);
  return out;
}

/** 42 day-cells (6 weeks, Monday-first) covering the month grid. */
export function monthMatrix(year: number, month: number): Date[] {
  const start = mondayOnOrBefore(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** All days of the month (1..N) — the mobile agenda's compact strip. */
export function monthDays(year: number, month: number): Date[] {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, month, i + 1));
}

/** ISO instants bounding the visible grid, padded a day each side so no
    boundary item is missed by the range query; the client buckets precisely. */
export function payloadRange(year: number, month: number): { from: string; to: string } {
  const cells = monthMatrix(year, month);
  const from = new Date(cells[0]);
  from.setDate(from.getDate() - 1);
  const to = new Date(cells[41]);
  to.setDate(to.getDate() + 2); // +2 then subtract 1ms → end of the +1 day
  to.setMilliseconds(to.getMilliseconds() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Full readable day for headers, day-first: "Sat 15 Aug 2026". */
export function dayHeading(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
