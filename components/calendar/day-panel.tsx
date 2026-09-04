"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CalendarClock, Clock, Pencil, Plus, Users, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { TaskChip } from "@/components/calendar/chips";
import { cn } from "@/lib/cn";
import { formatDMY } from "@/lib/dates";
import type { CalendarEventDTO, CalendarTaskDTO, ProjectDTO } from "@/lib/types";

export function DayPanel({
  heading,
  tasks,
  events,
  projects,
  isManager,
  onClose,
  onOpenTask,
  onCreateEvent,
  onEditEvent,
}: {
  heading: string;
  tasks: CalendarTaskDTO[];
  events: CalendarEventDTO[];
  projects: ProjectDTO[];
  isManager: boolean;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onCreateEvent: () => void;
  onEditEvent: (event: CalendarEventDTO) => void;
}) {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<CalendarEventDTO | null>(null);

  const byTool = new Map<string, { name: string; color: string; tasks: CalendarTaskDTO[] }>();
  for (const t of tasks) {
    const p = projects.find((x) => x.id === t.projectId);
    const g = byTool.get(t.projectId) ?? {
      name: p?.name ?? "Unknown",
      color: p?.color ?? "var(--muted)",
      tasks: [],
    };
    g.tasks.push(t);
    byTool.set(t.projectId, g);
  }

  const subtitle =
    [
      events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : null,
      tasks.length > 0 ? `${tasks.length} task date${tasks.length === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Nothing scheduled";

  return (
    <OverlayPortal>
      <AnimatePresence>
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-drawer bg-black/40"
          aria-hidden
        />
        <motion.aside
          key="panel"
          role="dialog"
          aria-label={`${heading} — day details`}
          initial={reduce ? { opacity: 0 } : { y: "100%" }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: "100%" }}
          transition={{ duration: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-0 z-drawer flex max-h-[88dvh] flex-col rounded-t-sheet border-t border-line bg-surface shadow-lift md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[26rem] md:max-w-[92vw] md:rounded-t-none md:border-l md:border-t-0"
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line md:hidden" />
          <div className="flex shrink-0 items-center gap-2 px-4 py-3">
            {selected ? (
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Back"
                className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-section font-semibold text-ink">
                {selected ? "Event" : heading}
              </h2>
              {selected ? null : (
                <p className="truncate text-micro text-muted">{subtitle}</p>
              )}
            </div>
            {!selected && isManager ? (
              <button
                type="button"
                onClick={onCreateEvent}
                className="press flex h-8 items-center gap-1.5 rounded-chip bg-primary px-2.5 text-micro font-medium text-on-primary"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Event
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:text-ink"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {selected ? (
              <EventDetail event={selected} isManager={isManager} onEdit={() => onEditEvent(selected)} />
            ) : (
              <>
                {events.length === 0 && tasks.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted">Nothing on this day.</p>
                ) : null}

                {events.length > 0 ? (
                  <section className="space-y-2">
                    <h3 className="text-micro font-medium uppercase tracking-widest text-muted">
                      Events
                    </h3>
                    {events.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelected(e)}
                        className="press flex w-full items-center gap-2 rounded-card bg-primary px-3 py-2 text-left text-on-primary transition-opacity duration-150 ease-out hover:opacity-95"
                      >
                        {e.isMeeting ? (
                          <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        ) : e.isGlobal ? (
                          <Users className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        ) : (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-surface"
                            style={{ background: e.projectColor ?? "var(--on-primary)" }}
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{e.title}</span>
                          <span className="block truncate text-micro opacity-90">
                            {e.isMeeting && e.startTime
                              ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ""} · `
                              : ""}
                            {e.isGlobal ? "All-hands" : e.projectName}
                          </span>
                        </span>
                      </button>
                    ))}
                  </section>
                ) : null}

                {byTool.size > 0 ? (
                  <section className="space-y-3">
                    <h3 className="text-micro font-medium uppercase tracking-widest text-muted">
                      Task dates
                    </h3>
                    {[...byTool.values()].map((group) => (
                      <div key={group.name} className="space-y-1.5">
                        <p className="flex items-center gap-1.5 text-micro font-medium text-ink">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: group.color }}
                            aria-hidden
                          />
                          {group.name}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.tasks.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => onOpenTask(t.id)}
                              className="press rounded-chip transition-transform duration-150 ease-out hover:-translate-y-px"
                            >
                              <TaskChip task={t} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                ) : null}
              </>
            )}
          </div>
        </motion.aside>
      </AnimatePresence>
    </OverlayPortal>
  );
}

function EventDetail({
  event,
  isManager,
  onEdit,
}: {
  event: CalendarEventDTO;
  isManager: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-lg font-semibold text-ink">{event.title}</h3>
        {isManager && event.isMeeting && event.projectId ? (
          // A meeting is scheduled/edited in the Meetings tab, not the plain
          // event modal — so its detail links there.
          <Link
            href={`/meetings/project/${event.projectId}`}
            className="press flex h-8 shrink-0 items-center gap-1.5 rounded-chip bg-hover px-2.5 text-micro font-medium text-ink"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Manage
          </Link>
        ) : isManager && !event.isMeeting ? (
          <button
            type="button"
            onClick={onEdit}
            className="press flex h-8 shrink-0 items-center gap-1.5 rounded-chip bg-hover px-2.5 text-micro font-medium text-ink"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Edit
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-chip bg-hover px-2.5 py-1 text-micro font-medium text-ink">
          {formatDMY(event.date)}
        </span>
        {event.isMeeting && event.startTime ? (
          <span className="flex items-center gap-1 rounded-chip bg-hover px-2.5 py-1 text-micro font-medium text-ink">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {event.startTime}
            {event.endTime ? `–${event.endTime}` : ""}
          </span>
        ) : null}
        {event.isGlobal ? (
          <span className="flex items-center gap-1 rounded-chip bg-primary-soft px-2.5 py-1 text-micro font-medium text-primary-ink">
            <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            All-hands
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-chip bg-hover px-2.5 py-1 text-micro font-medium text-ink">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: event.projectColor ?? "var(--muted)" }}
              aria-hidden
            />
            {event.projectName}
          </span>
        )}
      </div>

      {event.description.trim().length > 0 ? (
        <p className="whitespace-pre-wrap text-sm text-ink">{event.description}</p>
      ) : (
        <p className="text-sm italic text-muted">No details added.</p>
      )}

      {event.isMeeting && event.attendees.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-micro font-medium uppercase tracking-widest text-muted">
            <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {event.attendees.length} attendee{event.attendees.length === 1 ? "" : "s"}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {event.attendees.map((a) => (
              <li key={a.userId} className="rounded-chip bg-hover px-2 py-0.5 text-micro text-ink">
                {a.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={cn("border-t border-line pt-3 text-micro text-muted")}>
        Created by {event.createdByName} · {formatDMY(event.createdAt)}
      </p>
    </div>
  );
}
