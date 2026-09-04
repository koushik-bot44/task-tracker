"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { useEventMutations } from "@/lib/hooks/use-calendar";
import { useMeetingCandidates } from "@/lib/hooks/use-meetings";
import type { CalendarEventDTO } from "@/lib/types";

const field =
  "h-10 w-full rounded-input border border-line bg-bg px-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Schedule (or edit) a meeting on a project (phase 22). Attendees start ALL
 * checked — the manager deselects whoever isn't needed; at least one must remain.
 * A start time is required; an end time is optional but must be after start.
 */
export function ScheduleMeetingModal({
  open,
  onClose,
  projectId,
  projectName,
  meeting,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  meeting?: CalendarEventDTO; // present = edit
}) {
  const reduce = useReducedMotion();
  const { show: toast } = useToast();
  const { createEvent, updateEvent, deleteEvent } = useEventMutations();
  const { data: candidates, isLoading: loadingTeam } = useMeetingCandidates(projectId, open);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayKey());
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);

  // Reset the plain fields whenever the modal opens.
  useEffect(() => {
    if (!open) {
      setSeeded(false);
      return;
    }
    if (meeting) {
      setTitle(meeting.title);
      setDate(meeting.date.slice(0, 10));
      setStart(meeting.startTime ?? "10:00");
      setEnd(meeting.endTime ?? "");
      setDescription(meeting.description);
    } else {
      setTitle(`${projectName} meeting`);
      setDate(todayKey());
      setStart("10:00");
      setEnd("");
      setDescription("");
    }
  }, [open, meeting, projectName]);

  // Seed the attendee selection once: an edit uses the meeting's current
  // attendees; a new meeting preselects EVERY candidate (owner's choice).
  useEffect(() => {
    if (!open || seeded) return;
    if (meeting) {
      setSelected(new Set(meeting.attendees.map((a) => a.userId)));
      setSeeded(true);
    } else if (candidates) {
      setSelected(new Set(candidates.map((c) => c.userId)));
      setSeeded(true);
    }
  }, [open, seeded, meeting, candidates]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const endValid = !end || (HHMM.test(end) && end > start);
  const ready =
    title.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    HHMM.test(start) &&
    endValid &&
    selected.size >= 1;
  const pending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const submit = () => {
    if (!ready) return;
    const payload = {
      title: title.trim(),
      description: description.trim(),
      date,
      projectId,
      isMeeting: true,
      startTime: start,
      endTime: end || null,
      attendeeIds: [...selected],
    };
    const onErr = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
    if (meeting) {
      updateEvent.mutate(
        { id: meeting.id, patch: payload },
        { onSuccess: () => { toast({ message: "Meeting updated" }); onClose(); }, onError: onErr },
      );
    } else {
      createEvent.mutate(payload, {
        onSuccess: () => { toast({ message: "Meeting scheduled" }); onClose(); },
        onError: onErr,
      });
    }
  };

  const remove = () => {
    if (!meeting) return;
    if (!window.confirm(`Cancel "${meeting.title}"? Attendees are notified.`)) return;
    deleteEvent.mutate(meeting.id, {
      onSuccess: () => { toast({ message: "Meeting cancelled" }); onClose(); },
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };

  return (
    <OverlayPortal>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.16 }}
              onClick={onClose}
              className="fixed inset-0 z-drawer bg-black/45"
              aria-hidden
            />
            <div className="pointer-events-none fixed inset-0 z-drawer grid place-items-center p-4">
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={meeting ? "Edit meeting" : "Schedule meeting"}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto flex max-h-[88dvh] w-[min(34rem,94vw)] flex-col overflow-hidden rounded-sheet bg-surface shadow-lift"
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-section font-semibold text-ink">
                      {meeting ? "Edit meeting" : "Schedule meeting"}
                    </h2>
                    <p className="truncate text-micro text-muted">{projectName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:text-ink"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  <Labeled label="Title">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      aria-label="Meeting title"
                      className={field}
                      autoFocus
                    />
                  </Labeled>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Labeled label="Date">
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Meeting date" className={field} />
                    </Labeled>
                    <Labeled label="Start">
                      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" className={field} />
                    </Labeled>
                    <Labeled label="End (optional)">
                      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time" className={field} />
                    </Labeled>
                  </div>
                  {end && !endValid ? (
                    <p className="text-micro text-danger-ink">The end time must be after the start time.</p>
                  ) : null}

                  <Labeled label="Details">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Optional — agenda, link, room…"
                      aria-label="Meeting description"
                      className="w-full resize-y rounded-input border border-line bg-bg p-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
                    />
                  </Labeled>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-micro font-medium uppercase tracking-widest text-muted">
                        Attendees
                      </span>
                      <span className="text-micro tabular-nums text-muted">
                        {selected.size} selected
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-input border border-line">
                      {loadingTeam ? (
                        <p className="px-3 py-4 text-sm text-muted">Loading the team…</p>
                      ) : (candidates ?? []).length === 0 ? (
                        <p className="px-3 py-4 text-sm text-muted">
                          This project has no lead or members to invite yet.
                        </p>
                      ) : (
                        <ul className="divide-y divide-line">
                          {(candidates ?? []).map((c) => (
                            <li key={c.userId}>
                              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors duration-150 ease-out hover:bg-hover">
                                <input
                                  type="checkbox"
                                  checked={selected.has(c.userId)}
                                  onChange={() => toggle(c.userId)}
                                  className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                                  aria-label={`Invite ${c.name}`}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                                <span
                                  className={cn(
                                    "shrink-0 rounded-chip px-1.5 py-0.5 text-micro font-medium",
                                    c.role === "LEAD" ? "bg-primary-soft text-primary-ink" : "bg-hover text-muted",
                                  )}
                                >
                                  {c.role === "LEAD" ? "Lead" : "Team member"}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {seeded && selected.size === 0 ? (
                      <p className="mt-1 text-micro text-danger-ink">Pick at least one attendee.</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
                  {meeting ? (
                    <button
                      type="button"
                      onClick={remove}
                      disabled={pending}
                      className="press mr-auto flex h-9 items-center gap-1.5 rounded-card bg-danger-soft px-3 text-sm text-danger-ink disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                      Cancel meeting
                    </button>
                  ) : null}
                  <button type="button" onClick={onClose} className="press h-9 rounded-card px-3 text-sm text-muted hover:text-ink">
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!ready || pending}
                    className="press flex h-9 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-40"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                    {meeting ? "Save meeting" : "Schedule"}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        ) : null}
      </AnimatePresence>
    </OverlayPortal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro font-medium uppercase tracking-widest text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
