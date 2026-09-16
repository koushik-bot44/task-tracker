"use client";

import Link from "next/link";
import { isReview } from "@/components/calendar/chips";
import { Drawer } from "@/components/ui/drawer";
import { Face } from "@/components/ui/face";
import { snButton } from "@/components/work/sn";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import type { CalendarDeadlineDTO, CalendarEventDTO, CalendarTaskDateDTO } from "@/lib/types";

export type DayItems = { events: CalendarEventDTO[]; deadlines: CalendarDeadlineDTO[]; taskDates: CalendarTaskDateDTO[] };

/**
 * One day, opened from the grid or the strip: its reviews and meetings (who is
 * on them and what they are about) and its deadlines — nothing else
 * (owner, 2026-09-08). A bottom sheet on a phone, a panel on a desktop.
 *
 * Dressed as a record (owner, 2026-09-16: "here too ui change it"): 13px text,
 * 1px lines, 3px corners and small square buttons from components/work/sn.tsx,
 * so the day reads like the rest of the desk rather than a separate app.
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

  // Project deadlines are no longer a day's business, so a day is empty when it
  // has no meeting and nothing falling due (owner, 2026-09-16).
  const empty = meetings.length === 0 && items.taskDates.length === 0;

  return (
    <Drawer
      open={Boolean(day)}
      onClose={onClose}
      label={iso ? `${dateWord(iso)} — what's on` : "Day"}
      header={
        iso ? (
          <div className="min-w-0 pl-1">
            <p className="truncate text-[14px] font-semibold text-ink">{dateWord(iso)}</p>
            <p className="truncate text-[12px] text-muted">
              {new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        ) : null
      }
    >
      {iso ? (
        <div className="space-y-4 px-3 pb-4 pt-2">
          {empty ? <p className="py-10 text-center text-[13px] text-muted">Nothing on this day.</p> : null}

          {meetings.length > 0 ? (
            <section>
              <SectionLabel>Meetings</SectionLabel>
              <div className="space-y-2">
                {meetings.map((e) => (
                  <MeetingCard key={e.id} event={e} isManager={isManager} onEdit={() => onEditMeeting(e)} />
                ))}
              </div>
            </section>
          ) : null}

          {items.taskDates.length > 0 ? (
            <section>
              <SectionLabel>Deadlines</SectionLabel>
              <div className="rounded-[3px] border border-line">
                {items.taskDates.map((t) => (
                  <Link
                    key={t.id}
                    href={`/work/${t.number}`}
                    className="flex min-h-[38px] items-center gap-2 border-b border-line/70 px-2 py-1 text-[13px] last:border-b-0 hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{t.title}</span>
                      <span className="block text-[12px] text-muted">{t.ref}{t.projectName ? ` · ${t.projectName}` : ""}</span>
                    </span>
                    <span className="shrink-0 rounded-[3px] border border-danger bg-danger-soft px-1.5 py-0.5 text-[12px] font-medium text-danger-ink">Due</span>
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
  return <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">{children}</h3>;
}

/**
 * A meeting on the day: when it is, what it is, what it is about, who is on it
 * and who called it.
 *
 * Nothing to press (owner, 2026-09-16: "postpone all remove that keep simple
 * and clear"). Replying, "I'll be there", "Can't" and Postpone are gone from
 * the screen entirely. The one control left is the organiser's, because a
 * meeting still has to be correctable and cancellable by whoever called it.
 */
function MeetingCard({ event, isManager, onEdit }: { event: CalendarEventDTO; isManager: boolean; onEdit: () => void }) {
  const review = isReview(event);

  return (
    <div className="rounded-[3px] border border-line bg-surface">
      {/* The heading strip: the time, then what it is — a record's own header. */}
      <div className="flex items-start gap-2 border-b border-line bg-hover px-2 py-1.5">
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-[3px] px-1.5 text-[12px] font-semibold tabular-nums",
            review ? "bg-primary text-on-primary" : "border border-primary/40 bg-primary-soft text-primary-ink",
          )}
        >
          {event.startTime ?? (review ? "Review" : "Meeting")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{review && event.milestoneName ? `${event.milestoneName} review` : event.title}</p>
          <p className="truncate text-[12px] text-muted">
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

      <div className="space-y-1.5 px-2 py-1.5">
        {/* What it is about, and anything written with it. Both were in the payload
            all along and shown nowhere (owner, 2026-09-15: "make it detailed if
            opened the people and related stuff too"). */}
        {event.taskNumber ? (
          <Link
            href={`/work/${event.taskNumber}`}
            className="flex min-h-[30px] items-center gap-2 rounded-[3px] border border-line bg-bg px-2 text-[13px] hover:bg-hover"
          >
            <span className="shrink-0 text-[12px] font-semibold text-muted">{event.taskRef}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{event.taskTitle}</span>
          </Link>
        ) : null}
        {event.description.trim() ? <p className="whitespace-pre-wrap text-[13px] text-ink">{event.description}</p> : null}

        {/* Who is on it — the people, without who has and hasn't replied. */}
        {event.attendees.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex flex-wrap items-center gap-1">
              {event.attendees.map((a) => (
                <Face key={a.userId} name={a.name} size="sm" title={a.name} />
              ))}
            </span>
            <span className="min-w-0 text-[12px] text-muted">
              <span className="font-medium text-ink">On it:</span> {event.attendees.map((a) => a.name).join(", ")}
            </span>
          </div>
        ) : (
          <p className="text-[12px] text-muted">Nobody invited yet</p>
        )}

        <p className="text-[12px] text-muted">Scheduled by {event.createdByName}</p>

        {isManager ? (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
            {review ? (
              <Link href={`/project/${event.projectSlug ?? ""}`} className={cn(snButton, "!text-muted hover:!text-ink")}>
                Move it from the project page
              </Link>
            ) : (
              <button type="button" onClick={onEdit} className={snButton}>
                Edit or cancel
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
