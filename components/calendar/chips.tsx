"use client";

import { cn } from "@/lib/cn";
import { DEADLINE_TONE_STYLE, dateWord, deadlineTone } from "@/lib/dates";
import type { CalendarDeadlineDTO, CalendarEventDTO } from "@/lib/types";

/**
 * Calendar marks — three kinds, nothing else:
 *
 *   DEADLINE  a project's deadline: green / amber inside a week / red once
 *             passed (lib/dates decides), labelled with the project name.
 *   REVIEW    a milestone's review meeting: the accent, filled — "11:00 Design review".
 *   MEETING   any other meeting: the accent, soft — "15:00 Skyzen sync".
 *
 * Task dates are NOT on the calendar: it carries meetings and deadlines, and
 * nothing decorative — no dots (owner, 2026-09-08).
 *
 * Nothing here is under 13px; `compact` only trims the height for the grid.
 */

const BASE = "flex min-w-0 items-center gap-1.5 rounded-chip text-micro font-medium";
const size = (compact: boolean) => (compact ? "h-6 px-2" : "h-7 px-2.5");

/** A review is a meeting that belongs to a milestone. */
export const isReview = (event: CalendarEventDTO): boolean => Boolean(event.milestoneId);

/** "11:00 Design review" / "15:00 Skyzen sync". */
export function eventLabel(event: CalendarEventDTO): string {
  const time = event.startTime ? `${event.startTime} ` : "";
  const what = isReview(event) && event.milestoneName ? `${event.milestoneName} review` : event.title;
  return `${time}${what}`;
}

/** A review (filled) or a meeting (soft). */
export function EventChip({ event, compact = false }: { event: CalendarEventDTO; compact?: boolean }) {
  const review = isReview(event);
  return (
    <span
      className={cn(BASE, size(compact), review ? "bg-primary text-on-primary" : "bg-primary-soft text-primary-ink")}
      title={`${review ? "Review" : "Meeting"} · ${eventLabel(event)}${event.projectName ? ` · ${event.projectName}` : ""}`}
    >
      {event.startTime ? <span className="shrink-0 tabular-nums">{event.startTime}</span> : null}
      {/* "Milestone 2 review" says nothing — three of them on one month look
          identical. In a month cell the project's name is the useful half; the
          agenda has room for both (owner, 2026-09-08). */}
      <span className="min-w-0 truncate">
        {compact && review && event.projectName
          ? event.projectName
          : `${review && event.milestoneName ? `${event.milestoneName} review` : event.title}${!compact && event.projectName ? ` · ${event.projectName}` : ""}`}
      </span>
    </span>
  );
}

/** A project's deadline, labelled with the project name. */
export function DeadlineMark({ deadline, compact = false }: { deadline: CalendarDeadlineDTO; compact?: boolean }) {
  const tone = deadlineTone(deadline.deadline) ?? "green";
  return (
    <span
      className={cn(BASE, size(compact), DEADLINE_TONE_STYLE[tone])}
      title={`${deadline.name} · due ${dateWord(deadline.deadline)}`}
    >
      <span className="min-w-0 truncate">{deadline.name}</span>
    </span>
  );
}
