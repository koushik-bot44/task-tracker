import { startOfDay } from "@/lib/dates";

/**
 * The planner (owner, 2026-09-04): "I add 20 tasks and say 3 milestones —
 * they divide themselves equally, the review dates spread over the timeline,
 * every review is a meeting on the calendar with a message the day before."
 * Pure helpers shared by the sheet (preview) and the route (the real thing),
 * so what the founder sees is what they get.
 */

/** n things into `count` groups, as equal as possible, the first groups one bigger. */
export function splitCounts(n: number, count: number): number[] {
  const groups = Math.max(1, Math.min(count, n));
  const base = Math.floor(n / groups);
  const extra = n % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Saturday → Monday, Sunday → Monday. */
function workingDay(d: Date): Date {
  const day = d.getDay();
  if (day === 6) return addDays(d, 2);
  if (day === 0) return addDays(d, 1);
  return d;
}

/** Saturday → Friday, Sunday → Friday. */
function workingDayBack(d: Date): Date {
  const day = d.getDay();
  if (day === 6) return addDays(d, -1);
  if (day === 0) return addDays(d, -2);
  return d;
}

/**
 * `count` review dates spread evenly from `start` (never before today) to
 * `end` (the deadline; a week per milestone when there is none or it has
 * passed), each on a working day and strictly after the one before.
 */
export function planDates(opts: { start: Date | string; end: Date | string | null; count: number; now?: Date }): Date[] {
  const count = Math.max(1, opts.count);
  const today = startOfDay(opts.now ?? new Date());
  let from = startOfDay(new Date(opts.start));
  if (from < today) from = today;
  let to = opts.end ? startOfDay(new Date(opts.end)) : null;
  if (!to || to <= from) to = addDays(from, 7 * count);
  const span = to.getTime() - from.getTime();
  const out: Date[] = [];
  for (let i = 1; i <= count; i++) {
    const raw = startOfDay(new Date(from.getTime() + (span * i) / count));
    const prev = out[out.length - 1] ?? null;
    // Forward to Monday, unless that overshoots the deadline and Friday still sits after the box before.
    let d = workingDay(raw);
    if (d > to) {
      const back = workingDayBack(raw);
      if (back > today && (!prev || back > prev)) d = back;
    }
    if (prev && d <= prev) d = workingDay(addDays(prev, 1));
    if (d <= today) d = workingDay(addDays(today, 1));
    out.push(d);
  }
  return out;
}
