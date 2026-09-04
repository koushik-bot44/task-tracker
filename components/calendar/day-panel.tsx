"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { TaskChip, isReview } from "@/components/calendar/chips";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { DeadlineChip } from "@/components/ui/chip";
import { Drawer } from "@/components/ui/drawer";
import { Face } from "@/components/ui/face";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { dateWord, shortDate } from "@/lib/dates";
import { useMeetingReply } from "@/lib/hooks/use-today";
import type { CalendarDeadlineDTO, CalendarEventDTO, CalendarTaskDTO, MeetingResponse, ProjectDTO } from "@/lib/types";

export type DayItems = { tasks: CalendarTaskDTO[]; events: CalendarEventDTO[]; deadlines: CalendarDeadlineDTO[] };

/**
 * One day, opened from the grid or the strip: its reviews and meetings (with
 * everyone's replies and your own), its project deadlines, and its task
 * dates. A bottom sheet on a phone, a right-hand panel on a desktop.
 */
export function DayPanel({
  day,
  items,
  projects,
  isManager,
  onClose,
  onOpenTask,
  onEditMeeting,
}: {
  /** "YYYY-MM-DD", or null when closed. */
  day: string | null;
  items: DayItems;
  projects: ProjectDTO[];
  isManager: boolean;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onEditMeeting: (event: CalendarEventDTO) => void;
}) {
  const iso = day ? `${day}T00:00:00` : null;
  const meetings = [...items.events].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const byProject = new Map<string, { name: string; color: string; tasks: CalendarTaskDTO[] }>();
  for (const t of items.tasks) {
    const p = projects.find((x) => x.id === t.projectId);
    const g = byProject.get(t.projectId) ?? { name: p?.name ?? "Project", color: p?.color ?? "var(--muted)", tasks: [] };
    g.tasks.push(t);
    byProject.set(t.projectId, g);
  }

  const empty = meetings.length === 0 && items.deadlines.length === 0 && items.tasks.length === 0;

  return (
    <Drawer
      open={Boolean(day)}
      onClose={onClose}
      label={iso ? `${dateWord(iso)} — what's on` : "Day"}
      header={
        iso ? (
          <div className="min-w-0 pl-1">
            <p className="truncate text-row font-semibold text-ink">{dateWord(iso)}</p>
            <p className="truncate text-micro text-muted">
              {new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        ) : null
      }
    >
      {iso ? (
        <div className="space-y-6 px-4 pb-4 pt-1">
          {empty ? <p className="py-10 text-center text-sm text-muted">Nothing on this day.</p> : null}

          {meetings.length > 0 ? (
            <section>
              <SectionLabel>Meetings</SectionLabel>
              <div className="space-y-3">
                {meetings.map((e) => (
                  <MeetingCard key={e.id} event={e} isManager={isManager} onEdit={() => onEditMeeting(e)} />
                ))}
              </div>
            </section>
          ) : null}

          {items.deadlines.length > 0 ? (
            <section>
              <SectionLabel>Deadlines</SectionLabel>
              <div className="space-y-2">
                {items.deadlines.map((d) => (
                  <Link
                    key={d.projectId}
                    href={`/project/${d.slug}`}
                    className="press flex min-h-[56px] items-center gap-3 rounded-card bg-bg px-4"
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-row text-ink">{d.name}</span>
                      <span className="block text-micro text-muted">Project deadline</span>
                    </span>
                    <DeadlineChip deadline={d.deadline} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {byProject.size > 0 ? (
            <section>
              <SectionLabel>Task dates</SectionLabel>
              <div className="space-y-3">
                {[...byProject.entries()].map(([id, group]) => (
                  <div key={id}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: group.color }} aria-hidden />
                      {group.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.tasks.map((t) => (
                        <button key={t.id} type="button" onClick={() => onOpenTask(t.id)} className="press hit-40 rounded-chip" aria-label={`Open ${t.title}`}>
                          <TaskChip task={t} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-micro font-semibold uppercase tracking-wider text-muted">{children}</h3>;
}

const REPLY_WORD: Record<"YES" | "NO" | "none", string> = { YES: "coming", NO: "can't", none: "no reply yet" };

/**
 * A meeting on the day: when and what, everyone's faces with a green (coming)
 * / red (can't) / grey (no reply) dot, your own reply, and — for the person
 * who can move it — Reschedule once somebody can't make it.
 */
function MeetingCard({ event, isManager, onEdit }: { event: CalendarEventDTO; isManager: boolean; onEdit: () => void }) {
  const { reply } = useMeetingReply();
  const { show: toast } = useToast();
  const [changing, setChanging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [sending, setSending] = useState<MeetingResponse | null>(null);

  const review = isReview(event);
  const yes = event.attendees.filter((a) => a.response === "YES").length;
  const no = event.attendees.filter((a) => a.response === "NO").length;
  const quiet = event.attendees.length - yes - no;
  const summary =
    event.attendees.length === 0
      ? "Nobody invited yet"
      : [yes > 0 ? `${yes} coming` : null, no > 0 ? `${no} can't` : null, quiet > 0 ? `${quiet} no reply yet` : null].filter(Boolean).join(" · ");

  const answer = (response: MeetingResponse) => {
    setSending(response);
    reply.mutate(
      { eventId: event.id, response },
      {
        onSuccess: () => {
          setChanging(false);
          toast({ message: response === "YES" ? "Told them you'll be there" : "Told them you can't" });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
        onSettled: () => setSending(null),
      },
    );
  };

  const showButtons = event.isAttendee && (event.myResponse === null || changing);

  return (
    <div className="space-y-3 rounded-card bg-bg p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex h-7 shrink-0 items-center rounded-chip px-2.5 text-micro font-semibold tabular-nums",
            review ? "bg-primary text-on-primary" : "bg-primary-soft text-primary-ink",
          )}
        >
          {event.startTime ?? (review ? "Review" : "Meeting")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-row font-semibold text-ink">{review && event.milestoneName ? `${event.milestoneName} review` : event.title}</p>
          <p className="text-micro text-muted">
            {event.projectSlug ? (
              <Link href={`/project/${event.projectSlug}`} className="hover:underline">
                {event.projectName}
              </Link>
            ) : (
              event.projectName
            )}
            {event.endTime ? ` · until ${event.endTime}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {event.attendees.length > 0 ? (
          <span className="flex items-center gap-1.5">
            {event.attendees.map((a) => {
              const word = REPLY_WORD[a.response ?? "none"];
              return (
                <span key={a.userId} className="relative" title={`${a.name} · ${word}`}>
                  <Face name={a.name} title={`${a.name} · ${word}`} />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-bg",
                      a.response === "YES" ? "bg-ok" : a.response === "NO" ? "bg-danger" : "bg-guide",
                    )}
                    aria-hidden
                  />
                </span>
              );
            })}
          </span>
        ) : null}
        <span className="text-micro text-muted">{summary}</span>
      </div>

      {showButtons ? (
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => answer("YES")} loading={sending === "YES"} disabled={reply.isPending}>
            I&apos;ll be there
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => (event.canReschedule ? setMoving(true) : answer("NO"))}
            loading={sending === "NO"}
            disabled={reply.isPending}
          >
            Can&apos;t
          </Button>
        </div>
      ) : event.isAttendee ? (
        <p className="flex items-center gap-1 text-sm text-ink">
          {event.myResponse === "YES" ? "You said you'll be there." : "You said you can't."}
          <button type="button" onClick={() => setChanging(true)} className="press h-11 rounded-input px-2 text-sm font-medium text-primary-ink">
            Change
          </button>
        </p>
      ) : null}

      {event.canReschedule || isManager ? (
        <div className="flex flex-wrap items-center gap-2">
          {event.canReschedule ? (
            <Button variant="secondary" onClick={() => setMoving(true)}>
              Postpone
            </Button>
          ) : null}
          {isManager ? (
            review ? (
              <Link href={`/project/${event.projectSlug ?? ""}`} className="press inline-flex h-11 items-center rounded-input px-2 text-sm text-muted hover:text-ink">
                Move it from the project page
              </Link>
            ) : (
              <Button variant="quiet" onClick={onEdit}>
                Edit or cancel
              </Button>
            )
          ) : null}
        </div>
      ) : null}

      {event.canReschedule ? <RescheduleSheet open={moving} event={event} onClose={() => setMoving(false)} /> : null}
    </div>
  );
}

/** Three working days as words; one tap moves the meeting and re-asks everyone. */
function RescheduleSheet({ open, event, onClose }: { open: boolean; event: CalendarEventDTO; onClose: () => void }) {
  const { slots, reschedule } = useMeetingReply();
  const { show: toast } = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["meeting-slots", event.id],
    queryFn: () => slots(event.id),
    enabled: open,
  });

  const move = (iso: string) => {
    setPicked(iso);
    reschedule.mutate(
      { eventId: event.id, date: iso.slice(0, 10) },
      {
        onSuccess: () => {
          toast({ message: "Moved · everyone will get a new message" });
          onClose();
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
        onSettled: () => setPicked(null),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Move this meeting" subtitle={`${event.title} · ${dateWord(event.date)}`}>
      <p className="pt-1 text-sm text-muted">Pick a new day. Everyone on it gets a new message and can reply again.</p>
      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-input bg-hover" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-danger-ink">Couldn&apos;t load the days. Close this and try again.</p>
        ) : (
          (data?.slots ?? []).map((iso) => (
            <button
              key={iso}
              type="button"
              onClick={() => move(iso)}
              disabled={reschedule.isPending}
              className="press flex h-11 w-full items-center justify-between rounded-input bg-hover px-4 text-sm font-semibold text-ink disabled:opacity-40"
            >
              <span>{dateWord(iso)}</span>
              <span className="font-normal text-muted">{picked === iso ? "Moving…" : shortDate(iso)}</span>
            </button>
          ))
        )}
      </div>
    </Sheet>
  );
}
