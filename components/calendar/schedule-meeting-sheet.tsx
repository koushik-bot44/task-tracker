"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Face } from "@/components/ui/face";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { dayInputValue } from "@/lib/dates";
import { useEventMutations } from "@/lib/hooks/use-calendar";
import { useMeetingCandidates } from "@/lib/hooks/use-meetings";
import { useProjects } from "@/lib/hooks/use-projects";
import type { CalendarEventDTO } from "@/lib/types";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schedule a meeting: "Which project?" → "Who?" (everyone on the project,
 * all picked; tap a face to leave someone out) → "When?" → "What's it
 * about?" (defaults to "<project> meeting") → Save. The same sheet edits or
 * cancels an existing meeting when `meeting` is given. A review meeting
 * never comes here — its day belongs to the milestone.
 */
export function ScheduleMeetingSheet({
  open,
  onClose,
  projectId: presetProjectId = null,
  projectName: presetProjectName,
  meeting,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  /** Fixes the project (the project page); the calendar leaves it open. */
  projectId?: string | null;
  projectName?: string;
  /** Present = edit / cancel this meeting. */
  meeting?: CalendarEventDTO;
  /** "YYYY-MM-DD" to start on — the day that was open. */
  defaultDate?: string;
}) {
  const { show: toast } = useToast();
  const { data: projects } = useProjects();
  const { createEvent, updateEvent, deleteEvent } = useEventMutations();

  const [projectId, setProjectId] = useState<string | null>(meeting?.projectId ?? presetProjectId);
  const [who, setWho] = useState<Set<string>>(new Set());
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const { data: candidates, isLoading: loadingPeople } = useMeetingCandidates(projectId, open);

  const projectName = useMemo(
    () =>
      presetProjectName ??
      (projects ?? []).find((p) => p.id === projectId)?.name ??
      (meeting && meeting.projectId === projectId ? meeting.projectName : null) ??
      null,
    [presetProjectName, projects, projectId, meeting],
  );

  // Fresh every time it opens: an edit starts from the meeting, a new one
  // from the preset project and day.
  useEffect(() => {
    if (!open) return;
    setProjectId(meeting?.projectId ?? presetProjectId);
    setSeededFor(null);
    setWho(new Set(meeting ? meeting.attendees.map((a) => a.userId) : []));
    setDate(meeting ? meeting.date.slice(0, 10) : defaultDate ?? dayInputValue(new Date()));
    setStart(meeting?.startTime ?? "10:00");
    setEnd(meeting?.endTime ?? "");
    setTitle(meeting?.title ?? "");
    setTitleTouched(Boolean(meeting));
  }, [open, meeting, presetProjectId, defaultDate]);

  // Everyone on the project starts picked for a new meeting; picking a
  // different project re-seeds. An edit keeps the meeting's own list.
  useEffect(() => {
    if (!open || !projectId || !candidates || seededFor === projectId) return;
    if (!meeting || meeting.projectId !== projectId) setWho(new Set(candidates.map((c) => c.userId)));
    setSeededFor(projectId);
  }, [open, projectId, candidates, seededFor, meeting]);

  // The title follows the project until the person writes their own.
  useEffect(() => {
    if (!open || titleTouched) return;
    setTitle(projectName ? `${projectName} meeting` : "");
  }, [open, titleTouched, projectName]);

  const toggle = (id: string) =>
    setWho((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const endValid = !end || (HHMM.test(end) && end > start);
  const ready = Boolean(projectId) && title.trim().length > 0 && YMD.test(date) && HHMM.test(start) && endValid && who.size >= 1;
  const pending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const submit = () => {
    if (!ready || !projectId) return;
    const payload = {
      title: title.trim(),
      description: meeting?.description ?? "",
      date,
      projectId,
      isMeeting: true,
      startTime: start,
      endTime: end || null,
      attendeeIds: [...who],
    };
    const onError = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
    if (meeting) {
      updateEvent.mutate(
        { id: meeting.id, patch: payload },
        {
          onSuccess: () => {
            toast({ message: "Meeting updated · everyone on it will get a message" });
            onClose();
          },
          onError,
        },
      );
    } else {
      createEvent.mutate(payload, {
        onSuccess: () => {
          toast({ message: "Meeting scheduled · everyone on it will get a message" });
          onClose();
        },
        onError,
      });
    }
  };

  const cancelMeeting = () => {
    if (!meeting) return;
    if (!window.confirm("Cancel this meeting? Everyone on it will be told.")) return;
    deleteEvent.mutate(meeting.id, {
      onSuccess: () => {
        toast({ message: "Meeting cancelled" });
        onClose();
      },
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };

  const people = candidates ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={meeting ? "Edit meeting" : "Schedule a meeting"}
      subtitle={projectName ?? undefined}
      footer={
        meeting ? (
          <div className="flex gap-2">
            <Button variant="danger" onClick={cancelMeeting} disabled={pending} loading={deleteEvent.isPending}>
              Cancel meeting
            </Button>
            <Button variant="primary" className="flex-1" onClick={submit} disabled={!ready || pending} loading={updateEvent.isPending}>
              Save
            </Button>
          </div>
        ) : (
          <Button variant="primary" full onClick={submit} disabled={!ready || pending} loading={createEvent.isPending}>
            Save
          </Button>
        )
      }
    >
      <div className="space-y-5 pt-1">
        {presetProjectId || meeting ? null : (
          <Field label="Which project?">
            <select
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
              aria-label="Project"
              className={cn(inputClass, "appearance-none")}
              autoFocus
            >
              <option value="">Pick a project…</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-micro font-medium text-muted">Who?</span>
            {projectId && people.length > 0 ? (
              <span className="text-micro tabular-nums text-muted">
                {who.size} of {people.length}
              </span>
            ) : null}
          </div>
          {!projectId ? (
            <p className="text-sm text-muted">Pick a project first.</p>
          ) : loadingPeople && people.length === 0 ? (
            <div className="h-[5.5rem] animate-pulse rounded-card bg-hover" aria-hidden />
          ) : people.length === 0 ? (
            <p className="text-sm text-muted">Nobody is on this project yet — add people from the project page.</p>
          ) : (
            <div role="group" aria-label="Who" className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {people.map((p) => {
                const on = who.has(p.userId);
                return (
                  <button
                    key={p.userId}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(p.userId)}
                    className={cn(
                      "press flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-card px-1 py-2",
                      on ? "bg-primary-soft ring-2 ring-primary" : "bg-hover opacity-60",
                    )}
                  >
                    <Face name={p.name} size="lg" />
                    <span className="w-full truncate text-center text-micro font-medium text-ink">{p.name.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {projectId && seededFor === projectId && people.length > 0 && who.size === 0 ? (
            <p className="mt-1 text-micro text-danger-ink">Pick at least one person.</p>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-micro font-medium text-muted">When?</span>
          <div className="space-y-2">
            <input
              type="date"
              value={date}
              min={meeting ? undefined : dayInputValue(new Date())}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Day"
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-micro text-muted">Starts</span>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-micro text-muted">Ends (optional)</span>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time" className={inputClass} />
              </label>
            </div>
          </div>
          {end && !endValid ? <p className="mt-1 text-micro text-danger-ink">The end has to be after the start.</p> : null}
        </div>

        <Field label="What's it about?">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={projectName ? `${projectName} meeting` : "e.g. Weekly catch-up"}
            aria-label="What's it about"
            className={inputClass}
          />
        </Field>
      </div>
    </Sheet>
  );
}
