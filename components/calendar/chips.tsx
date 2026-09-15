"use client";

import { cn } from "@/lib/cn";
import { DEADLINE_TONE_STYLE, dateWord, deadlineTone } from "@/lib/dates";
import type { CalendarDeadlineDTO, CalendarEventDTO, CalendarTaskDateDTO } from "@/lib/types";

/**
 * Calendar marks — three kinds, nothing else:
 *
 *   DEADLINE  a project's deadline: green / amber inside a week / red once
 *             passed (lib/dates decides), labelled with the project name.
 *   REVIEW    a milestone's review meeting: the accent, filled — "11:00 Design review".
 *   MEETING   any other meeting: the accent, soft — "15:00 Skyzen sync".
 *
 *   TASK DATE a task falling due: outlined, never filled, and always last in a
 *             day (owner, 2026-09-15). Filled means something you attend;
 *             outlined means a date to keep. The difference is the shape and
 *             the weight, not the colour, so it survives the dark theme and a
 *             reader who cannot tell the colours apart.
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
      {/* What it is, then what it is about — and no time (owner, 2026-09-15:
          "just meeting and dead line ...no time"). The hour is on the day itself
          when it is opened; on a month it only crowds out the words. */}
      <span className="min-w-0 truncate">
        {review ? `Review · ${event.milestoneName ?? event.projectName ?? event.title}` : `Meeting · ${event.title}`}
      </span>
    </span>
  );
}

/** A task that falls due: outlined, so it never reads as something to attend. */
export function TaskDateMark({ task, compact = false }: { task: CalendarTaskDateDTO; compact?: boolean }) {
  return (
    <span
      className={cn(BASE, size(compact), "border border-line bg-surface text-muted")}
      title={`Due · ${task.ref} ${task.title}${task.projectName ? ` · ${task.projectName}` : ""}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full border border-current" />
      <span className="min-w-0 truncate">{compact ? task.title : `${task.title}${task.projectName ? ` · ${task.projectName}` : ""}`}</span>
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
      <span className="min-w-0 truncate">Deadline · {deadline.name}</span>
    </span>
  );
}
