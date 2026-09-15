"use client";

import Link from "next/link";
import { isReview } from "@/components/calendar/chips";
import { Button } from "@/components/ui/button";
import { DeadlineChip } from "@/components/ui/chip";
import { Drawer } from "@/components/ui/drawer";
import { Face } from "@/components/ui/face";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import type { CalendarDeadlineDTO, CalendarEventDTO, CalendarTaskDateDTO } from "@/lib/types";

export type DayItems = { events: CalendarEventDTO[]; deadlines: CalendarDeadlineDTO[]; taskDates: CalendarTaskDateDTO[] };

/**
 * One day, opened from the grid or the strip: its reviews and meetings (who is
 * on them and what they are about) and its deadlines — nothing else
 * (owner, 2026-09-08). A bottom sheet on a phone, a panel on a desktop.
 */
export function DayPanel({
  day,
  items,
  isManager,
  onClose,
  onEditMeeting,
}: {
  /** "YYYY-MM-DD", or null when closed. */
  day: string | null;
  items: DayItems;
  isManager: boolean;
  onClose: () => void;
  onEditMeeting: (event: CalendarEventDTO) => void;
}) {
  const iso = day ? `${day}T00:00:00` : null;
  const meetings = [...items.events].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const empty = meetings.length === 0 && items.deadlines.length === 0 && items.taskDates.length === 0;

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

          {items.taskDates.length > 0 ? (
            <section>
              <SectionLabel>Deadlines</SectionLabel>
              <div className="space-y-2">
                {items.taskDates.map((t) => (
                  <Link key={t.id} href={`/work/${t.number}`} className="press flex min-h-[56px] items-center gap-3 rounded-card bg-bg px-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-row text-ink">{t.title}</span>
                      <span className="block text-micro text-muted">{t.ref}{t.projectName ? ` · ${t.projectName}` : ""}</span>
                    </span>
                    <span className="shrink-0 rounded-chip border border-danger bg-danger-soft px-2 py-0.5 text-micro font-medium text-danger-ink">Due</span>
                  </Link>
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

        </div>
      ) : null}
    </Drawer>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-micro font-semibold uppercase tracking-wider text-muted">{children}</h3>;
}

/**
 * A meeting on the day: when it is, what it is, what it is about, who is on it
 * and who called it.
 *
 * Nothing to press (owner, 2026-09-16: "postpone all remove that keep simple
 * and clear"). Replying, "I'll be there", "Can't" and Postpone are gone from
 * the screen entirely. The one control left is the organiser's, because a
 * meeting still has to be correctable and cancellable by the person who called
 * it.
 */
function MeetingCard({ event, isManager, onEdit }: { event: CalendarEventDTO; isManager: boolean; onEdit: () => void }) {
  const review = isReview(event);

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

      {/* What it is about, and anything written with it. Both were in the payload
          all along and shown nowhere (owner, 2026-09-15: "make it detailed if
          opened the people and related stuff too"). */}
      {event.taskNumber ? (
        <Link href={`/work/${event.taskNumber}`} className="press flex min-h-[44px] items-center gap-2 rounded-card bg-surface px-3">
          <span className="shrink-0 text-micro font-semibold text-muted">{event.taskRef}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{event.taskTitle}</span>
        </Link>
      ) : null}
      {event.description.trim() ? <p className="whitespace-pre-wrap text-sm text-ink">{event.description}</p> : null}

      {/* Who is on it — the people, without who has and hasn't replied. */}
      {event.attendees.length > 0 ? (
        <div className="space-y-2">
          <span className="flex flex-wrap items-center gap-1.5">
            {event.attendees.map((a) => (
              <Face key={a.userId} name={a.name} title={a.name} />
            ))}
          </span>
          <p className="text-micro text-muted">
            <span className="font-medium text-ink">On it:</span> {event.attendees.map((a) => a.name).join(", ")}
          </p>
        </div>
      ) : (
        <p className="text-micro text-muted">Nobody invited yet</p>
      )}

      <p className="text-micro text-muted">Scheduled by {event.createdByName}</p>

      {isManager ? (
        <div className="flex flex-wrap items-center gap-2">
          {review ? (
            <Link href={`/project/${event.projectSlug ?? ""}`} className="press inline-flex h-11 items-center rounded-input px-2 text-sm text-muted hover:text-ink">
              Move it from the project page
            </Link>
          ) : (
            <Button variant="quiet" onClick={onEdit}>
              Edit or cancel
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
