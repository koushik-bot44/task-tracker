"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DayPanel } from "@/components/calendar/day-panel";
import { EventModal } from "@/components/calendar/event-modal";
import { ProjectFilter } from "@/components/calendar/project-filter";
import { EventChip, TaskChip } from "@/components/calendar/chips";
import { FirstRunHint } from "@/components/first-run-hint";
import { cn } from "@/lib/cn";
import {
  dayHeading,
  dayKey,
  dayKeyOf,
  isSameMonth,
  isToday,
  monthDays,
  monthLabel,
  monthMatrix,
  payloadRange,
  WEEKDAYS,
} from "@/lib/calendar";
import { useCalendar } from "@/lib/hooks/use-calendar";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMe } from "@/lib/hooks/use-users";
import { isManagerRole } from "@/lib/roles";
import type { CalendarEventDTO, CalendarTaskDTO } from "@/lib/types";

type DayItems = { tasks: CalendarTaskDTO[]; events: CalendarEventDTO[] };
const FILTER_KEY = "orbit-calendar-filter";

export function CalendarView() {
  const reduce = useReducedMotion();
  const today = new Date();
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string[] | null>(null);
  const [showGlobal, setShowGlobal] = useState(true);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; event?: CalendarEventDTO; date: string } | null>(null);

  const { data: projects } = useProjects();
  const { data: me } = useMe();
  const { openTask } = usePanelParams();
  // Creating / editing events is a manager OR admin act (phase 13, peers).
  const isManager = isManagerRole(me?.role);

  // Restore persisted filter once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        const v = JSON.parse(raw) as { selected: string[] | null; showGlobal: boolean };
        setSelected(v.selected ?? null);
        setShowGlobal(v.showGlobal ?? true);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ selected, showGlobal }));
    } catch {
      /* ignore */
    }
  }, [selected, showGlobal]);

  const { from, to } = useMemo(() => payloadRange(ym.year, ym.month), [ym]);
  const { data, isLoading } = useCalendar(from, to, selected);

  const buckets = useMemo(() => {
    const m = new Map<string, DayItems>();
    const bucket = (k: string) => {
      let d = m.get(k);
      if (!d) {
        d = { tasks: [], events: [] };
        m.set(k, d);
      }
      return d;
    };
    for (const t of data?.tasks ?? []) bucket(dayKey(t.dueDate)).tasks.push(t);
    for (const e of data?.events ?? []) {
      if (e.isGlobal && !showGlobal) continue;
      bucket(dayKey(e.date)).events.push(e);
    }
    return m;
  }, [data, showGlobal]);

  const grid = useMemo(() => monthMatrix(ym.year, ym.month), [ym]);
  const strip = useMemo(() => monthDays(ym.year, ym.month), [ym]);
  const activeDays = useMemo(
    () => strip.filter((d) => (buckets.get(dayKeyOf(d))?.tasks.length ?? 0) + (buckets.get(dayKeyOf(d))?.events.length ?? 0) > 0),
    [strip, buckets],
  );

  const step = (delta: number) => {
    const d = new Date(ym.year, ym.month + delta, 1);
    setYm({ year: d.getFullYear(), month: d.getMonth() });
  };
  const goToday = () => setYm({ year: today.getFullYear(), month: today.getMonth() });

  const dayOf = (k: string): DayItems => buckets.get(k) ?? { tasks: [], events: [] };

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      <FirstRunHint id="calendar">
        Task due-dates and meetings, together. {isManager ? "Click a day to add an event." : "Click a day for details."}
      </FirstRunHint>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:bg-hover hover:text-ink">
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="min-w-[10rem] text-center font-display text-page font-semibold text-ink sm:min-w-[12rem]">
            {monthLabel(ym.year, ym.month)}
          </h1>
          <button type="button" onClick={() => step(1)} aria-label="Next month" className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:bg-hover hover:text-ink">
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <button type="button" onClick={goToday} className="press h-9 rounded-card border border-line px-3 text-sm text-ink">
          Today
        </button>
        {isManager ? (
          <button
            type="button"
            onClick={() => setModal({ mode: "create", date: dayKeyOf(today) })}
            className="press ml-auto flex h-9 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Event
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <ProjectFilter
          projects={projects ?? []}
          selected={selected}
          onSelected={setSelected}
          showGlobal={showGlobal}
          onShowGlobal={setShowGlobal}
        />
      </div>

      {/* ── Month grid (desktop) ─────────────────────────────────────────── */}
      <div className="mt-4 hidden md:block">
        {/* Keyed by month so a step re-mounts the grid and it fades+rises in —
            reduced-motion falls straight to the final frame. */}
        <motion.div
          key={`grid-${ym.year}-${ym.month}`}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-7 gap-px overflow-hidden rounded-card border border-line bg-line"
        >
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-surface px-2 py-2 text-center text-micro font-semibold uppercase tracking-wide text-muted">
              {w}
            </div>
          ))}
          {grid.map((d) => {
            const k = dayKeyOf(d);
            const items = dayOf(k);
            const marks = [
              ...items.events.map((e) => ({ kind: "event" as const, e })),
              ...items.tasks.map((t) => ({ kind: "task" as const, t })),
            ];
            const shown = marks.slice(0, 3);
            const more = marks.length - shown.length;
            const inMonth = isSameMonth(d, ym.year, ym.month);
            const todayCell = isToday(d);
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <button
                key={k}
                type="button"
                data-day={k}
                onClick={() => setOpenDay(k)}
                className={cn(
                  "flex min-h-[7rem] flex-col gap-1 p-2 text-left align-top transition-colors duration-150 hover:bg-hover",
                  // Today owns the cell (soft tint); out-of-month and in-month
                  // weekends recede to the page bg; ordinary weekdays are white.
                  todayCell
                    ? "bg-primary-soft"
                    : !inMonth
                      ? "bg-bg text-muted"
                      : weekend
                        ? "bg-bg"
                        : "bg-surface",
                )}
              >
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-micro font-semibold tabular-nums",
                    todayCell ? "bg-primary text-on-primary" : inMonth ? "text-ink" : "text-muted",
                  )}
                >
                  {d.getDate()}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  {shown.map((m, i) => (
                    <span key={i} className="pointer-events-none flex min-w-0">
                      {m.kind === "event" ? <EventChip event={m.e} compact /> : <TaskChip task={m.t} compact />}
                    </span>
                  ))}
                  {more > 0 ? (
                    <span className="w-fit rounded-chip bg-hover px-1.5 py-0.5 text-[11px] font-medium text-muted">
                      +{more} more
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>

      {/* ── Agenda (mobile) ──────────────────────────────────────────────── */}
      <div className="mt-4 md:hidden">
        <div className="flex gap-1 overflow-x-auto pb-2">
          {strip.map((d) => {
            const k = dayKeyOf(d);
            const items = dayOf(k);
            const n = items.tasks.length + items.events.length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setOpenDay(k)}
                className={cn(
                  "flex h-14 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-card border text-center",
                  isToday(d) ? "border-primary bg-primary-soft" : "border-line bg-surface",
                )}
              >
                <span className="text-[10px] uppercase text-muted">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
                <span className={cn("text-sm font-semibold tabular-nums", isToday(d) ? "text-primary-ink" : "text-ink")}>
                  {d.getDate()}
                </span>
                <span className={cn("h-1.5 w-1.5 rounded-full", n > 0 ? "bg-primary" : "bg-transparent")} aria-hidden />
              </button>
            );
          })}
        </div>

        <motion.div
          key={`agenda-${ym.year}-${ym.month}`}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 space-y-2.5"
        >
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-card bg-hover" aria-hidden />
          ) : activeDays.length === 0 ? (
            <p className="card p-8 text-center text-sm text-muted">Nothing scheduled this month.</p>
          ) : (
            activeDays.map((d) => {
              const items = dayOf(dayKeyOf(d));
              const n = items.events.length + items.tasks.length;
              return (
                <button
                  key={dayKeyOf(d)}
                  type="button"
                  onClick={() => setOpenDay(dayKeyOf(d))}
                  className="block w-full rounded-card border border-line bg-surface p-3 text-left transition-colors duration-150 hover:bg-hover"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{dayHeading(d)}</p>
                    {isToday(d) ? (
                      <span className="rounded-chip bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-ink">
                        Today
                      </span>
                    ) : null}
                    <span className="ml-auto text-micro tabular-nums text-muted">{n}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.events.map((e) => (
                      <EventChip key={e.id} event={e} />
                    ))}
                    {items.tasks.map((t) => (
                      <TaskChip key={t.id} task={t} />
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </motion.div>
      </div>

      {openDay ? (
        <DayPanel
          heading={dayHeading(new Date(`${openDay}T00:00:00`))}
          tasks={dayOf(openDay).tasks}
          events={dayOf(openDay).events}
          projects={projects ?? []}
          isManager={Boolean(isManager)}
          onClose={() => setOpenDay(null)}
          onOpenTask={(id) => {
            setOpenDay(null);
            openTask(id);
          }}
          onCreateEvent={() => setModal({ mode: "create", date: openDay })}
          onEditEvent={(event) => setModal({ mode: "edit", event, date: event.date.slice(0, 10) })}
        />
      ) : null}

      {modal ? (
        <EventModal
          open
          mode={modal.mode}
          event={modal.event}
          defaultDate={modal.date}
          projects={projects ?? []}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}
