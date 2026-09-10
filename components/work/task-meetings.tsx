"use client";

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { ScheduleMeetingSheet } from "@/components/calendar/schedule-meeting-sheet";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/hooks/use-users";
import { useTaskMeetings } from "@/lib/hooks/use-work";
import { isManagerRole } from "@/lib/roles";
import { istDayKey } from "@/lib/timezone";
import type { CalendarEventDTO, TaskDTO } from "@/lib/types";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

/** "2026-09" → its days as "YYYY-MM-DD", padded to whole weeks from Monday (null = padding). */
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
  while (out.length % 7) out.push(null);
  return out;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Sat 12 Sep" for a "YYYY-MM-DD" day. */
function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * A task's meetings on a small calendar (owner, 2026-09-11): a dot on every day
 * that has one. A manager taps the calendar symbol — or a day, then "+ Meeting"
 * — to schedule one with the same sheet the Calendar uses, the task's people
 * already ticked; it lands on Today for everyone invited.
 */
export function TaskMeetings({ task }: { task: TaskDTO }) {
  const { data: me } = useMe();
  const canSchedule = isManagerRole(me?.role);
  const { data: meetings } = useTaskMeetings(task.id);
  const today = istDayKey(new Date());
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const [scheduleOn, setScheduleOn] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarEventDTO | null>(null);

  const byDay = useMemo(() => {
    const out = new Map<string, CalendarEventDTO[]>();
    for (const m of meetings ?? []) {
      const key = m.date.slice(0, 10);
      out.set(key, [...(out.get(key) ?? []), m]);
    }
    return out;
  }, [meetings]);
  const upcoming = (meetings ?? []).filter((m) => m.date.slice(0, 10) >= today);
  const listed = picked ? byDay.get(picked) ?? [] : upcoming.slice(0, 3);
  // The only people a task's meeting invites, and tells: whoever holds the task, asked for it or gave it,
  // and whoever schedules it (owner, 2026-09-11).
  const people = useMemo(() => {
    const out = new Map<string, string>();
    const add = (id: string | null | undefined, name: string | null | undefined) => {
      if (id && name && !out.has(id)) out.set(id, name);
    };
    add(task.assigneeId, task.assigneeName);
    for (const p of task.alsoWith) add(p.id, p.name);
    add(task.requesterId, task.requesterName);
    add(task.givenById, task.givenByName);
    add(me?.id, me?.name);
    return [...out].map(([userId, name]) => ({ userId, name }));
  }, [task.assigneeId, task.assigneeName, task.alsoWith, task.requesterId, task.requesterName, task.givenById, task.givenByName, me?.id, me?.name]);
  const label = monthLabel(month);

  return (
    <div className="w-full max-w-[19rem] rounded-[3px] border border-line bg-surface p-2">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month" className="press grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <span className="min-w-0 flex-1 text-center text-[13px] font-medium text-ink">{label}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month" className="press grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        {canSchedule ? (
          <button
            type="button"
            onClick={() => setScheduleOn(picked && picked >= today ? picked : today)}
            aria-label="Schedule a meeting"
            title="Schedule a meeting"
            className="press grid h-7 w-7 place-items-center rounded-full text-primary-ink hover:bg-hover"
          >
            <CalendarPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>

      <div role="group" aria-label={`Meetings in ${label}`} className="mt-1 grid grid-cols-7 text-center">
        {WEEK.map((d, i) => (
          <span key={`h-${i}`} aria-hidden className="py-0.5 text-[10px] font-medium text-muted">
            {d}
          </span>
        ))}
        {monthCells(month).map((key, i) => {
          if (!key) return <span key={`pad-${i}`} aria-hidden />;
          const count = byDay.get(key)?.length ?? 0;
          const on = picked === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPicked(on ? null : key)}
              aria-pressed={on}
              aria-label={`${dayLabel(key)}${count ? `, ${count} meeting${count === 1 ? "" : "s"}` : ""}`}
              className={cn(
                "press relative mx-auto grid h-7 w-7 place-items-center rounded-full text-[12px] tabular-nums",
                on ? "bg-primary text-on-primary" : key === today ? "font-semibold text-primary-ink ring-1 ring-primary" : key < today ? "text-muted hover:bg-hover" : "text-ink hover:bg-hover",
              )}
            >
              {Number(key.slice(8))}
              {count ? <span aria-hidden className={cn("absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full", on ? "bg-on-primary" : "bg-primary")} /> : null}
            </button>
          );
        })}
      </div>

      <ul className="mt-2 space-y-0.5 border-t border-line pt-2" aria-label={picked ? `Meetings on ${dayLabel(picked)}` : "Meetings ahead"}>
        {listed.length ? (
          listed.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={!canSchedule}
                onClick={() => setEditing(m)}
                className="flex min-h-[28px] w-full items-center gap-2 rounded-[3px] px-1 text-left text-[12px] enabled:hover:bg-hover disabled:cursor-default"
              >
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="shrink-0 text-muted">
                  {dayLabel(m.date.slice(0, 10))}
                  {m.startTime ? ` · ${m.startTime}` : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{m.title}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="px-1 text-[12px] text-muted">{picked ? "No meeting that day." : "No meetings ahead."}</li>
        )}
        {canSchedule && picked && picked >= today ? (
          <li>
            <button type="button" onClick={() => setScheduleOn(picked)} className="press min-h-[28px] px-1 text-[12px] font-medium text-primary-ink">
              + Meeting on {dayLabel(picked)}
            </button>
          </li>
        ) : null}
      </ul>

      <ScheduleMeetingSheet
        open={Boolean(scheduleOn)}
        onClose={() => setScheduleOn(null)}
        defaultDate={scheduleOn ?? undefined}
        taskId={task.id}
        taskTitle={task.title.trim() || task.ref}
        people={people}
      />
      <ScheduleMeetingSheet open={Boolean(editing)} onClose={() => setEditing(null)} meeting={editing ?? undefined} people={people} />
    </div>
  );
}
