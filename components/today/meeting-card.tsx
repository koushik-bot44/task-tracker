"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Face } from "@/components/ui/face";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { dateWord, shortDate } from "@/lib/dates";
import { useMeetingReply } from "@/lib/hooks/use-today";
import type { CalendarEventDTO, MeetingAttendeeDTO, MeetingResponse } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today" / "Tomorrow" / "Mon 8 Sep" — a day to pick from. */
function slotWord(iso: string): string {
  const word = dateWord(iso);
  if (word === "Today" || word === "Tomorrow") return word;
  return `${WEEKDAYS[new Date(iso).getDay()]} ${shortDate(iso)}`;
}

/**
 * One meeting on Today: what, when, which project; your reply or the two
 * reply buttons; and, for whoever can move it, the replies so far plus
 * [Reschedule] once anyone has said they can't.
 */
export function MeetingCard({ meeting }: { meeting: CalendarEventDTO }) {
  const { reply, slots, reschedule } = useMeetingReply();
  const { show: toast } = useToast();
  const [changing, setChanging] = useState(false);
  const [moving, setMoving] = useState(false);

  const when = [dateWord(meeting.date), meeting.startTime, meeting.projectName].filter(Boolean).join(" · ");
  const anyCant = meeting.attendees.some((a) => a.response === "NO");
  const showReplies = meeting.canReschedule && anyCant;
  const replying = reply.isPending && reply.variables?.eventId === meeting.id;

  const send = (response: MeetingResponse) =>
    reply.mutate(
      { eventId: meeting.id, response },
      {
        onSuccess: () => setChanging(false),
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );

  return (
    <Card as="article" className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-row font-medium text-ink">{meeting.title}</p>
          <p className="truncate text-micro text-muted">{when}</p>
        </div>
        {meeting.milestoneId ? <Chip tone="primary">Review</Chip> : null}
      </div>

      {meeting.isAttendee ? (
        meeting.myResponse && !changing ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-micro text-muted">
            {meeting.myResponse === "YES" ? "You said you'll be there" : "You said you can't"}
            <button type="button" onClick={() => setChanging(true)} className="press hit-40 rounded-md px-1 font-medium text-primary-ink">
              Change
            </button>
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => send("YES")} loading={replying && reply.variables?.response === "YES"} disabled={replying}>
              {"I'll be there"}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => send("NO")} loading={replying && reply.variables?.response === "NO"} disabled={replying}>
              {"Can't"}
            </Button>
          </div>
        )
      ) : null}

      {showReplies ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <ul className="flex items-center gap-1.5" aria-label="Replies">
            {meeting.attendees.map((a) => (
              <li key={a.userId}>
                <ReplyFace attendee={a} />
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => setMoving(true)}>
            Reschedule
          </Button>
        </div>
      ) : null}

      <RescheduleSheet
        open={moving}
        onClose={() => setMoving(false)}
        meeting={meeting}
        loadSlots={() => slots(meeting.id)}
        pending={reschedule.isPending}
        onPick={(date) =>
          reschedule.mutate(
            { eventId: meeting.id, date },
            {
              onSuccess: () => {
                setMoving(false);
                toast({ message: "Moved · everyone will get a new message" });
              },
              onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
            },
          )
        }
      />
    </Card>
  );
}

/** A small face with a dot: green for "I'll be there", red for "Can't", grey for no reply yet. */
function ReplyFace({ attendee }: { attendee: MeetingAttendeeDTO }) {
  const label = attendee.response === "YES" ? "will be there" : attendee.response === "NO" ? "can't make it" : "hasn't replied";
  return (
    <span className="relative inline-flex">
      <Face name={attendee.name} size="sm" title={`${attendee.name} ${label}`} />
      <span
        aria-hidden
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface",
          attendee.response === "YES" ? "bg-ok" : attendee.response === "NO" ? "bg-danger" : "bg-guide",
        )}
      />
    </span>
  );
}

/** Three working days to move the meeting to. Tap one and it's done. */
function RescheduleSheet({
  open,
  onClose,
  meeting,
  loadSlots,
  pending,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  meeting: CalendarEventDTO;
  loadSlots: () => Promise<{ slots: string[] }>;
  pending: boolean;
  onPick: (date: string) => void;
}) {
  const [list, setList] = useState<string[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setList(null);
    setFailed(null);
    setPicked(null);
    loadSlots()
      .then((r) => {
        if (alive) setList(r.slots);
      })
      .catch((e: unknown) => {
        if (alive) setFailed((e as Error).message);
      });
    return () => {
      alive = false;
    };
    // The loader is a stable call for this meeting; refetch only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meeting.id]);

  return (
    <Sheet open={open} onClose={onClose} title="Move this meeting" subtitle={meeting.title}>
      <p className="pb-3 text-sm text-muted">Pick a day. Everyone gets a new message and replies start again.</p>
      {failed ? (
        <p className="text-sm text-danger-ink">{failed}</p>
      ) : list === null ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-hover" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((slot) => {
            const date = slot.slice(0, 10);
            const busy = pending && picked === date;
            return (
              <li key={slot}>
                <Button
                  variant="secondary"
                  full
                  className="h-14 justify-start"
                  loading={busy}
                  disabled={pending}
                  onClick={() => {
                    setPicked(date);
                    onPick(date);
                  }}
                >
                  {slotWord(slot)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
