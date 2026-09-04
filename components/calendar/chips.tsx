"use client";

import { CalendarClock, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CalendarEventDTO, CalendarTaskDTO } from "@/lib/types";

/**
 * Calendar marks. TASKS are OUTLINE chips whose border carries the date-state
 * (overdue/at-risk/normal — the value comes from the server via lib/dates, not
 * recomputed here) plus a tool-colour dot. EVENTS are FILLED chips, visually
 * distinct at a glance; a global event swaps the tool dot for an all-hands mark.
 * A MEETING (phase 22) is a filled chip too but carries a clock glyph and its
 * start time, so it reads differently from a plain event AND from a task date.
 * Provisional task dates get a dashed edge and a leading "~", as everywhere.
 */

const OUTLINE: Record<CalendarTaskDTO["dateState"], string> = {
  overdue: "border-danger text-danger-ink",
  "at-risk": "border-warn text-warn-ink",
  normal: "border-line text-ink",
  none: "border-line text-ink",
};

export function TaskChip({ task, compact = false }: { task: CalendarTaskDTO; compact?: boolean }) {
  const done = task.status === "DONE" || task.status === "CANCELLED";
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-chip border bg-surface",
        compact ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-micro",
        OUTLINE[task.dateState],
        task.dueProvisional && "border-dashed",
        done && "opacity-60",
      )}
      title={task.title}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: task.projectColor }}
        aria-hidden
      />
      <span className="min-w-0 truncate">
        {task.dueProvisional ? "~" : ""}
        {task.title}
      </span>
    </span>
  );
}

export function EventChip({ event, compact = false }: { event: CalendarEventDTO; compact?: boolean }) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-chip bg-primary font-medium text-on-primary",
        compact ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-micro",
      )}
      title={
        event.isMeeting
          ? `Meeting${event.startTime ? ` ${event.startTime}` : ""}: ${event.title}`
          : event.isGlobal
            ? `All-hands: ${event.title}`
            : event.title
      }
    >
      {event.isMeeting ? (
        <CalendarClock className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
      ) : event.isGlobal ? (
        <Users className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
      ) : (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-surface"
          style={{ background: event.projectColor ?? "var(--on-primary)" }}
          aria-hidden
        />
      )}
      <span className="min-w-0 truncate">
        {event.isMeeting && event.startTime ? (
          <span className="font-semibold tabular-nums">{event.startTime} </span>
        ) : null}
        {event.title}
      </span>
    </span>
  );
}
