"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CalendarDayDTO, CalendarMonthDTO } from "@/lib/types";
import { addDays, asUTC, prettyDate, weekdayInitial, weekdayShort } from "./shared";

/**
 * The month calendar (2026-09-25): a phone-calendar grid over the glass, one
 * button per day, and under the grid the day that is picked. A day carries up
 * to three 6px dots — teal for tasks, purple for a tutor's report, green for
 * and, on the parent's side, a thin green bar for how many habits were
 * met. Rules show only in the day's panel: most rules are daily, and a dot on
 * every day says nothing. Days after today are muted and cannot be picked; the
 * "Next month" button never goes past this month.
 *
 * The component owns no state: the screen keeps `month` and `selected` so the
 * parent's and the son's screens can wire their own hooks. When the month
 * changes, the screen should move `selected` into it (say, its first day), else
 * the panel asks for a day.
 */

/** "2026-09-25" -> "2026-09". */
export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** Step a "YYYY-MM" key by n months, across year ends: shiftMonth("2026-01", -1) = "2025-12". */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** "2026-09" -> "September 2026" (read as UTC so the month never shifts). */
const monthLabel = (month: string) =>
  asUTC(`${month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthName = (month: string) => asUTC(`${month}-01`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });


/**
 * The grid's cells, Monday first: `null` for a leading/trailing cell that
 * belongs to a neighbouring month, else the day key. A month that starts on a
 * Sunday gets six leading empties; the tail pads to a full week.
 */
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const countThings = (day: CalendarDayDTO | undefined) =>
  day ? day.tasks.length + day.reports.length + day.rules.length : 0;

export function CalendarView({
  data,
  month,
  onMonth,
  today,
  selected,
  onSelect,
  showHabits,
  failed = false,
  onRetry,
}: {
  data: CalendarMonthDTO | undefined;
  month: string;
  onMonth: (m: string) => void;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
  showHabits: boolean;
  /** The month could not be fetched: say so and offer another go (review, 2026-09-25). */
  failed?: boolean;
  onRetry?: () => void;
}) {
  const cells = monthCells(month);
  // The Monday that starts the first row — the weekday initials read off it.
  const leading = cells.findIndex((c) => c !== null);
  const rowStart = addDays(`${month}-01`, -leading);
  const initials = Array.from({ length: 7 }, (_, i) => weekdayInitial(addDays(rowStart, i)));
  const atCurrent = month >= monthOf(today);
  const name = monthName(month);
  const days = data?.days;
  const selectedInMonth = monthOf(selected) === month;
  const picked = selectedInMonth ? days?.[selected] : undefined;

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      {/* Month header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
          className="pk-press grid h-11 w-11 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)]"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <h2 className="min-w-0 truncate text-center font-display text-lg font-semibold pk-fg">{monthLabel(month)}</h2>
        <button
          type="button"
          onClick={() => onMonth(shiftMonth(month, 1))}
          disabled={atCurrent}
          aria-label="Next month"
          className="pk-press grid h-11 w-11 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Weekday initials, Monday first */}
      <div className="-mx-2 mb-1 grid grid-cols-7 gap-0.5 sm:mx-0 sm:gap-1" aria-hidden>
        {initials.map((ch, i) => (
          <div key={i} className="min-w-0 text-center text-micro font-medium pk-fg-soft">
            {ch}
          </div>
        ))}
      </div>

      {/* The grid */}
      <div className="-mx-2 grid grid-cols-7 gap-0.5 sm:mx-0 sm:gap-1" role="group" aria-label={monthLabel(month)}>
        {cells.map((key, i) => {
          if (key === null) return <div key={`empty-${i}`} aria-hidden className="min-h-[48px] min-w-0" />;
          const day = days?.[key];
          const isToday = key === today;
          const isSelected = key === selected;
          const future = key > today;
          const n = countThings(day);
          const label = `${Number(key.slice(8))} ${name}, ${n === 0 ? (future ? "not yet" : "nothing") : n === 1 ? "1 thing" : `${n} things`}`;
          const habits = showHabits && day?.habits && day.habits.total > 0 ? day.habits : null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              disabled={future && n === 0}
              aria-label={label}
              aria-pressed={isSelected}
              className={cn(
                "pk-press flex min-h-[48px] min-w-0 flex-col items-center gap-1 rounded-card pk-cell px-0 pb-1.5 pt-1",
                isSelected && "pk-today",
                future && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm tabular-nums leading-none",
                  isToday ? "bg-primary font-semibold text-on-primary" : future ? "pk-fg-soft" : "pk-fg",
                )}
              >
                {Number(key.slice(8))}
              </span>
              {/* Dots: teal = tasks, purple = a tutor's report. Kept at
                  a fixed height so a day with nothing sits level with its neighbours. */}
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {day && day.tasks.length > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                {day && day.reports.length > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]" /> : null}
              </span>
              {habits ? (
                <span className="h-[3px] w-6 overflow-hidden rounded-full bg-[color:var(--pk-cell-bd)]" aria-hidden>
                  <span className="block h-full rounded-full bg-ok" style={{ width: `${Math.round((habits.met / habits.total) * 100)}%` }} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* The picked day */}
      <div className="mt-4 border-t border-[color:var(--pk-cell-bd)] pt-3">
        {!selectedInMonth ? (
          <p className="py-2 text-center text-sm pk-fg-soft">Pick a day.</p>
        ) : (
          <DayPanel dayKey={selected} day={picked} today={today} loading={data === undefined && !failed} failed={failed} onRetry={onRetry} showHabits={showHabits} />
        )}
      </div>
    </section>
  );
}

function DayPanel({
  dayKey,
  day,
  today,
  loading,
  failed = false,
  onRetry,
  showHabits,
}: {
  dayKey: string;
  day: CalendarDayDTO | undefined;
  today: string;
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
  showHabits: boolean;
}) {
  const habits = showHabits && day?.habits && day.habits.total > 0 ? day.habits : null;
  const empty = !day || (day.tasks.length === 0 && day.reports.length === 0 && day.rules.length === 0 && !habits);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold pk-fg">
        {weekdayShort(dayKey)} {prettyDate(dayKey)}
        {dayKey === today ? <span className="pk-fg-soft"> · Today</span> : null}
      </h3>

      {failed ? (
        <div className="py-2 text-center">
          <p className="text-sm pk-fg-soft">Could not load this month.</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="press mt-2 inline-flex h-11 items-center rounded-card bg-primary px-4 text-sm font-medium text-on-primary">Try again</button>
          ) : null}
        </div>
      ) : loading ? (
        <p className="py-2 text-center text-sm pk-fg-soft">Loading…</p>
      ) : empty ? (
        <p className="py-2 text-center text-sm pk-fg-soft">Nothing on this day.</p>
      ) : (
        <div className="space-y-3">
          {day!.tasks.length > 0 ? (
            <div>
              <p className="mb-1 text-micro font-medium pk-fg-soft">Tasks</p>
              <ul className="space-y-1.5">
                {day!.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2.5">
                    <span
                      role="img"
                      aria-label={t.done ? "Done" : "Not done"}
                      className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", t.done ? "border-ok bg-ok text-on-primary" : "border-line")}
                    >
                      {t.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}
                    </span>
                    <span className={cn("min-w-0 flex-1 break-words text-sm", t.done ? "pk-fg-soft line-through" : "pk-fg")}>{t.title}</span>
                    {t.addedBy === "PERSON" ? (
                      <span className="pk-chip shrink-0 rounded-card px-2 py-0.5 text-micro font-medium" title="Something they added for themselves">
                        his own
                      </span>
                    ) : t.addedBy === "MENTOR" ? (
                      <span className="pk-chip shrink-0 rounded-card px-2 py-0.5 text-micro font-medium" title="Homework a tutor set">tutor</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {day!.reports.length > 0 ? (
            <div>
              <p className="mb-1 text-micro font-medium pk-fg-soft">Tutors</p>
              <ul className="space-y-1.5">
                {day!.reports.map((r) => (
                  <li key={r.id} className="rounded-card pk-cell px-3 py-2.5">
                    <p className="min-w-0 truncate text-sm font-semibold pk-fg">
                      {r.subject} <span className="font-normal pk-fg-soft">· {r.mentorName}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-sm pk-fg">{r.covered}</p>
                    {r.homework ? <p className="mt-1.5 break-words text-sm font-medium pk-fg">Homework: {r.homework}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {day!.rules.length > 0 ? (
            <div>
              <p className="mb-1 text-micro font-medium pk-fg-soft">Rules</p>
              <ul className="space-y-1.5">
                {day!.rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 rounded-card pk-cell px-3 py-2.5">
                    <span className="min-w-0 flex-1 break-words text-sm pk-fg">{r.name}</span>
                    <span className="shrink-0 text-micro font-medium text-warn-ink">crossed</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {habits ? (
            <p className="text-sm pk-fg">
              Habits: <span className="font-semibold">{habits.met} of {habits.total} met</span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
