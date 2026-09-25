"use client";

import { Check, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocationDay } from "@/lib/hooks/use-routine";
import { whereLabel } from "./location-log";
import type { RoutineTaskDTO } from "@/lib/types";
import { prettyDate, weekdayShort } from "./shared";

/** "2:42 pm" in IST — a clock reading of an instant, not a day key. */
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** The IST day key ("YYYY-MM-DD") an instant falls on. */
const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * The first thing the parent sees on Summary (2026-09-25): today's date and how
 * the day's tasks stand. Read-only — the ticks are the person's to make, and new
 * tasks are added in the Tracker. A task counts as today's when it is dated today
 * or undated ("any day"). The person's own extras carry a small "his own" chip.
 * Under the count, one line says where the person was last seen (their latest
 * check-in or phone position) — nothing at all when there is none yet.
 */
export function TodayCard({ tasks, today, personId }: { tasks: RoutineTaskDTO[]; today: string; personId: string | null }) {
  const todays = tasks.filter((t) => t.dueDate === today || t.dueDate === null);
  const done = todays.filter((t) => t.done).length;
  const { data: location } = useLocationDay(null, personId);
  const last = location?.lastSeen ?? null;
  // A check-in says its place; a phone position just says it is on the map. An
  // older position carries its date so "2:42 pm" is never read as today's.
  const lastLine = last
    ? `Last seen: ${whereLabel(last)} · ${istDay(last.at) === today ? "" : `${prettyDate(istDay(last.at))} `}${clockTime(last.at)}`
    : null;

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sun className="h-5 w-5 shrink-0 text-warn-ink" strokeWidth={2} aria-hidden />
          <h2 className="font-display text-lg font-semibold pk-fg">Today</h2>
        </div>
        <span className="shrink-0 text-sm pk-fg-soft">{weekdayShort(today)} {prettyDate(today)}</span>
      </div>
      <p className={cn("text-sm", lastLine ? "mb-1" : "mb-3", todays.length > 0 && done === todays.length ? "font-medium text-ok-ink" : "pk-fg-soft")}>
        {todays.length === 0 ? "Nothing set for today" : `${done} of ${todays.length} done`}
      </p>
      {lastLine ? <p className="mb-3 text-sm pk-fg">{lastLine}</p> : null}
      {todays.length === 0 ? null : (
        <ul className="space-y-2">
          {todays.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2.5">
              <span
                aria-label={t.done ? "Done" : "Not done yet"}
                role="img"
                className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", t.done ? "border-ok bg-ok text-on-primary" : "border-line")}
              >
                {t.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-sm", t.done ? "pk-fg-soft line-through" : "pk-fg")}>{t.title}</span>
              {t.addedBy === "MENTOR" ? (
                <span className="pk-chip shrink-0 rounded-card px-2 py-0.5 text-micro font-medium" title="Homework a tutor set">tutor</span>
              ) : t.addedBy === "PERSON" ? (
                <span className="pk-chip shrink-0 rounded-card px-2 py-0.5 text-micro font-medium" title="Something they added for themselves">his own</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
