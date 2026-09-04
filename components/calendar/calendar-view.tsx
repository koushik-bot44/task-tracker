"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DeadlineMark, EventChip, TaskChip, isReview } from "@/components/calendar/chips";
import { DayPanel, type DayItems } from "@/components/calendar/day-panel";
import { ProjectFilter } from "@/components/calendar/project-filter";
import { ScheduleMeetingSheet } from "@/components/calendar/schedule-meeting-sheet";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { dayKey, dayKeyOf, isSameMonth, isToday, monthDays, monthLabel, monthMatrix, payloadRange, WEEKDAYS } from "@/lib/calendar";
import { daysUntil } from "@/lib/dates";
import { useCalendar } from "@/lib/hooks/use-calendar";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMe } from "@/lib/hooks/use-users";
import { isManagerRole } from "@/lib/roles";
import type { CalendarEventDTO } from "@/lib/types";

const EMPTY: DayItems = { tasks: [], events: [], deadlines: [] };
const FILTER_KEY = "orbit-calendar-projects";
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SheetState = { mode: "create"; date: string } | { mode: "edit"; event: CalendarEventDTO };

/**
 * The calendar: a month of reviews, meetings, project deadlines and task
 * dates. A grid on a desktop; a strip of days plus the month's agenda on a
 * phone. Tap a day for the details; managers schedule a meeting from here.
 */
export function CalendarView() {
  const reduce = useReducedMotion();
  const today = new Date();
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string[] | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const { data: projects } = useProjects();
  const { data: me } = useMe();
  const { openTask } = usePanelParams();
  const isManager = isManagerRole(me?.role);

  // The project filter is remembered between visits.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        const v = JSON.parse(raw) as { selected: string[] | null };
        setSelected(Array.isArray(v.selected) ? v.selected : null);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ selected }));
    } catch {
      /* ignore */
    }
  }, [selected]);

  const { from, to } = useMemo(() => payloadRange(ym.year, ym.month), [ym]);
  const { data, isLoading } = useCalendar(from, to, selected);

  const buckets = useMemo(() => {
    const m = new Map<string, DayItems>();
    const bucket = (k: string) => {
      let d = m.get(k);
      if (!d) {
        d = { tasks: [], events: [], deadlines: [] };
        m.set(k, d);
      }
      return d;
    };
    for (const d of data?.deadlines ?? []) bucket(dayKey(d.deadline)).deadlines.push(d);
    for (const e of data?.events ?? []) bucket(dayKey(e.date)).events.push(e);
    for (const t of data?.tasks ?? []) bucket(dayKey(t.dueDate)).tasks.push(t);
    // Reviews first, then by time.
    for (const d of m.values()) {
      d.events.sort((a, b) => Number(isReview(b)) - Number(isReview(a)) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    }
    return m;
  }, [data]);

  const dayOf = (k: string): DayItems => buckets.get(k) ?? EMPTY;
  const countOf = (k: string) => {
    const d = dayOf(k);
    return d.events.length + d.deadlines.length + d.tasks.length;
  };

  const grid = useMemo(() => monthMatrix(ym.year, ym.month), [ym]);
  const strip = useMemo(() => monthDays(ym.year, ym.month), [ym]);
  const activeDays = useMemo(
    () =>
      strip.filter((d) => {
        const b = buckets.get(dayKeyOf(d));
        return b ? b.events.length + b.deadlines.length + b.tasks.length > 0 : false;
      }),
    [strip, buckets],
  );

  const step = (delta: number) => {
    const d = new Date(ym.year, ym.month + delta, 1);
    setYm({ year: d.getFullYear(), month: d.getMonth() });
  };
  const onThisMonth = ym.year === today.getFullYear() && ym.month === today.getMonth();
  const goToday = () => setYm({ year: today.getFullYear(), month: today.getMonth() });

  // On a phone the strip opens with today in view.
  const todayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = todayRef.current;
    const rail = el?.parentElement;
    if (!el || !rail) return;
    rail.scrollLeft = el.offsetLeft - rail.clientWidth / 2 + el.clientWidth / 2;
  }, [ym]);

  const fade = {
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  };

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4 lg:max-w-[1120px]">
      {/* ── Month, Today, Schedule ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <IconButton label="Previous month" onClick={() => step(-1)}>
            <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </IconButton>
          <h2 className="min-w-[10rem] text-center text-section font-semibold text-ink">{monthLabel(ym.year, ym.month)}</h2>
          <IconButton label="Next month" onClick={() => step(1)}>
            <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
          </IconButton>
        </div>
        {onThisMonth ? null : (
          <Button variant="secondary" onClick={goToday}>
            Today
          </Button>
        )}
        {isManager ? (
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
            className="ml-auto w-full sm:w-auto"
            onClick={() => setSheet({ mode: "create", date: dayKeyOf(today) })}
          >
            Schedule meeting
          </Button>
        ) : null}
      </div>

      <div className="mt-3">
        <ProjectFilter projects={projects ?? []} selected={selected} onSelected={setSelected} />
      </div>

      {/* ── Month grid (desktop; a tablet next to the rail gets the agenda) ─ */}
      <div className="mt-4 hidden lg:block">
        <motion.div
          key={`grid-${ym.year}-${ym.month}`}
          {...fade}
          className="grid grid-cols-7 gap-px overflow-hidden rounded-card bg-line shadow-e1"
        >
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-surface px-2 py-2 text-center text-micro font-semibold uppercase tracking-wider text-muted">
              {w}
            </div>
          ))}
          {grid.map((d) => {
            const k = dayKeyOf(d);
            const items = dayOf(k);
            const marks = [
              ...items.deadlines.map((x) => ({ key: `d-${x.projectId}`, node: <DeadlineMark deadline={x} compact /> })),
              ...items.events.map((x) => ({ key: `e-${x.id}`, node: <EventChip event={x} compact /> })),
              ...items.tasks.map((x) => ({ key: `t-${x.id}`, node: <TaskChip task={x} compact /> })),
            ];
            const shown = marks.slice(0, 3);
            const more = marks.length - shown.length;
            const inMonth = isSameMonth(d, ym.year, ym.month);
            const todayCell = isToday(d);
            return (
              <button
                key={k}
                type="button"
                data-day={k}
                onClick={() => setOpenDay(k)}
                aria-label={`${WEEKDAY_LONG[d.getDay()]} ${d.getDate()}${marks.length ? ` · ${marks.length} on this day` : ""}`}
                className={cn(
                  "press flex min-h-[7.5rem] flex-col items-start gap-1 p-2 text-left",
                  inMonth ? "bg-surface" : "bg-bg",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-micro font-semibold tabular-nums",
                    todayCell ? "bg-primary text-on-primary" : inMonth ? "text-ink" : "text-muted",
                  )}
                >
                  {d.getDate()}
                </span>
                <span className="flex w-full min-w-0 flex-col gap-1">
                  {shown.map((m) => (
                    <span key={m.key} className="pointer-events-none flex min-w-0">
                      {m.node}
                    </span>
                  ))}
                  {more > 0 ? <span className="px-1 text-micro font-medium text-muted">+{more} more</span> : null}
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>

      {/* ── Strip + agenda (phone and tablet) ──────────────────────────── */}
      <div className="mt-4 lg:hidden">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
          {strip.map((d) => {
            const k = dayKeyOf(d);
            const n = countOf(k);
            const todayCell = isToday(d);
            return (
              <button
                key={k}
                ref={todayCell ? todayRef : undefined}
                type="button"
                data-day={k}
                onClick={() => setOpenDay(k)}
                aria-label={`${WEEKDAY_LONG[d.getDay()]} ${d.getDate()}${n ? ` · ${n} on this day` : ""}`}
                className={cn(
                  "press flex h-16 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-card",
                  todayCell ? "bg-primary text-on-primary" : "bg-surface text-ink shadow-e1",
                )}
              >
                <span className={cn("text-micro", todayCell ? "text-on-primary" : "text-muted")}>{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
                <span className="text-row font-semibold tabular-nums">{d.getDate()}</span>
                <span className={cn("h-1.5 w-1.5 rounded-full", n > 0 ? (todayCell ? "bg-on-primary" : "bg-primary") : "bg-transparent")} aria-hidden />
              </button>
            );
          })}
        </div>

        <motion.div key={`agenda-${ym.year}-${ym.month}`} {...fade} className="mt-3 space-y-3">
          {isLoading ? (
            <Skeleton rows={3} />
          ) : activeDays.length === 0 ? (
            <EmptyState title="Nothing this month" body="Meetings, reviews, deadlines and task dates will show up here." />
          ) : (
            activeDays.map((d) => {
              const k = dayKeyOf(d);
              const items = dayOf(k);
              const ahead = daysUntil(k);
              return (
                <button key={k} type="button" onClick={() => setOpenDay(k)} className="card press block w-full p-4 text-left">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-row font-semibold text-ink">
                      {WEEKDAY_LONG[d.getDay()]} {d.getDate()}
                    </p>
                    {ahead === 0 || ahead === 1 ? (
                      <span className="rounded-chip bg-primary-soft px-2 py-0.5 text-micro font-semibold text-primary-ink">{ahead === 0 ? "Today" : "Tomorrow"}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.deadlines.map((x) => (
                      <DeadlineMark key={x.projectId} deadline={x} />
                    ))}
                    {items.events.map((x) => (
                      <EventChip key={x.id} event={x} />
                    ))}
                    {items.tasks.map((x) => (
                      <TaskChip key={x.id} task={x} />
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </motion.div>
      </div>

      <DayPanel
        day={openDay}
        items={openDay ? dayOf(openDay) : EMPTY}
        projects={projects ?? []}
        isManager={Boolean(isManager)}
        onClose={() => setOpenDay(null)}
        onOpenTask={(id) => {
          setOpenDay(null);
          openTask(id);
        }}
        onEditMeeting={(event) => {
          setOpenDay(null);
          setSheet({ mode: "edit", event });
        }}
      />

      <ScheduleMeetingSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        meeting={sheet?.mode === "edit" ? sheet.event : undefined}
        defaultDate={sheet?.mode === "create" ? sheet.date : undefined}
      />
    </div>
  );
}
