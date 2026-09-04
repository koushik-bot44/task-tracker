/**
 * All teammates are IST (owner-confirmed), so the "due today" boundary and the
 * dates shown in emails are computed in IST — from ONE place, so the cron and
 * the templates can never disagree about what day it is.
 */
export const IST_OFFSET_MINUTES = 5 * 60 + 30; // +05:30

function shiftToIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The IST calendar day (YYYY-MM-DD) an instant falls on. */
export function istDayKey(date: Date): string {
  const d = shiftToIST(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** UTC instants bounding an IST calendar day, for a `dueDate` range query. */
export function istDayRange(dayKey: string): { start: Date; end: Date } {
  const [y, m, d] = dayKey.split("-").map(Number);
  // IST midnight of that day, expressed as a UTC instant.
  const startUtcMs = Date.UTC(y, m - 1, d) - IST_OFFSET_MINUTES * 60_000;
  return { start: new Date(startUtcMs), end: new Date(startUtcMs + 24 * 60 * 60_000 - 1) };
}

/** "15 Aug 2026", day-first, in IST — for email subjects and bodies. */
export function formatISTDate(date: Date): string {
  const d = shiftToIST(date);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}
