"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Face } from "@/components/ui/face";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { dayInputValue } from "@/lib/dates";
import { useEventMutations } from "@/lib/hooks/use-calendar";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useMeetingCandidates } from "@/lib/hooks/use-meetings";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canSeeUserListRole } from "@/lib/roles";
import type { CalendarEventDTO } from "@/lib/types";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** What the meeting is about — that choice fills the faces by itself. */
type About = "project" | "department" | "everyone" | "person";

const ABOUT: { key: About; label: string }[] = [
  { key: "project", label: "A project" },
  { key: "department", label: "A department" },
  { key: "everyone", label: "Everyone" },
  { key: "person", label: "One person" },
];

type Candidate = { userId: string; name: string };

/**
 * Schedule a meeting (owner, 2026-09-08 — "make it simpler"): three questions.
 * "About?" (a project / a department / everyone / one person) — the choice
 * fills the faces by itself; "When?"; "What's it about?". Tap a face to add
 * or leave someone out. The same sheet edits or cancels an existing meeting.
 * A review meeting never comes here — its day belongs to the milestone.
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
  const { data: me } = useMe();
  const { data: projects } = useProjects();
  const { data: departments } = useDepartments();
  const { createEvent, updateEvent, deleteEvent } = useEventMutations();

  const [about, setAbout] = useState<About>("project");
  const [projectId, setProjectId] = useState<string | null>(meeting?.projectId ?? presetProjectId);
  const [departmentId, setDepartmentId] = useState("");
  const [who, setWho] = useState<Set<string>>(new Set());
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const { data: candidates, isLoading: loadingPeople } = useMeetingCandidates(about === "project" ? projectId : null, open);
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));

  const projectName = useMemo(
    () =>
      presetProjectName ??
      (projects ?? []).find((p) => p.id === projectId)?.name ??
      (meeting && meeting.projectId === projectId ? meeting.projectName : null) ??
      null,
    [presetProjectName, projects, projectId, meeting],
  );
  const departmentName = (departments ?? []).find((d) => d.id === departmentId)?.name ?? null;

  // Everyone who could be invited outside a project: active colleagues.
  const colleagues = useMemo<Candidate[]>(
    () =>
      (users ?? [])
        .filter((u) => u.status === "ACTIVE" && !u.disabledAt)
        .map((u) => ({ userId: u.id, name: u.name })),
    [users],
  );

  const people = useMemo<Candidate[]>(() => {
    if (about === "project") return candidates ?? [];
    if (about === "department") return colleagues.filter((c) => (users ?? []).find((u) => u.id === c.userId)?.departmentId === departmentId);
    return colleagues;
  }, [about, candidates, colleagues, users, departmentId]);

  // Fresh every time it opens: an edit starts from the meeting, a new one
  // from the preset project and day.
  useEffect(() => {
    if (!open) return;
    setAbout(meeting ? (meeting.projectId ? "project" : "everyone") : presetProjectId ? "project" : "project");
    setProjectId(meeting?.projectId ?? presetProjectId);
    setDepartmentId("");
    setSeededFor(null);
    setWho(new Set(meeting ? meeting.attendees.map((a) => a.userId) : []));
    setDate(meeting ? meeting.date.slice(0, 10) : defaultDate ?? dayInputValue(new Date()));
    setStart(meeting?.startTime ?? "10:00");
    setEnd(meeting?.endTime ?? "");
    setTitle(meeting?.title ?? "");
    setTitleTouched(Boolean(meeting));
  }, [open, meeting, presetProjectId, defaultDate]);

  // The choice fills the faces: a project's people, a department's people,
  // the whole company — all picked; "one person" starts empty. An edit keeps
  // the meeting's own list.
  const seedKey = about === "project" ? `p:${projectId ?? ""}` : about === "department" ? `d:${departmentId}` : about;
  useEffect(() => {
    if (!open || seededFor === seedKey || meeting) return;
    if (about === "project") {
      if (!projectId || !candidates) return;
      setWho(new Set(candidates.map((c) => c.userId)));
    } else if (about === "department") {
      if (!departmentId || !users) return;
      setWho(new Set(people.map((p) => p.userId)));
    } else if (about === "everyone") {
      if (!users) return;
      setWho(new Set(people.map((p) => p.userId)));
    } else {
      setWho(new Set());
    }
    setSeededFor(seedKey);
  }, [open, meeting, about, seedKey, seededFor, projectId, departmentId, candidates, users, people]);

  // The title follows the choice until the person writes their own.
  useEffect(() => {
    if (!open || titleTouched) return;
    if (about === "project") setTitle(projectName ? `${projectName} meeting` : "");
    else if (about === "department") setTitle(departmentName ? `${departmentName} meeting` : "");
    else if (about === "everyone") setTitle("Company meeting");
    else setTitle("Catch-up");
  }, [open, titleTouched, about, projectName, departmentName]);

  const toggle = (id: string) =>
    setWho((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const endValid = !end || (HHMM.test(end) && end > start);
  const contextReady = about === "project" ? Boolean(projectId) : about === "department" ? Boolean(departmentId) : true;
  const ready = contextReady && title.trim().length > 0 && YMD.test(date) && HHMM.test(start) && endValid && who.size >= 1;
  const pending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const submit = () => {
    if (!ready) return;
    const payload = {
      title: title.trim(),
      description: meeting?.description ?? "",
      date,
      projectId: about === "project" ? projectId : null,
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

  const subtitle = about === "project" ? projectName : about === "department" ? departmentName : about === "everyone" ? "The whole company" : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={meeting ? "Edit meeting" : "Schedule a meeting"}
      subtitle={subtitle ?? undefined}
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
          <div>
            <span className="mb-1.5 block text-micro font-medium text-muted">About what?</span>
            <div role="group" aria-label="About what" className="flex flex-wrap gap-2">
              {ABOUT.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={about === o.key}
                  onClick={() => {
                    setAbout(o.key);
                    setSeededFor(null);
                  }}
                  className={cn(
                    "press h-9 rounded-chip px-3.5 text-sm font-medium",
                    about === o.key ? "bg-ink text-on-ink" : "bg-surface text-muted shadow-e1 hover:text-ink",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {about === "project" && !presetProjectId && !meeting ? (
          <Field label="Which project?">
            <select
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
              aria-label="Project"
              className={cn(inputClass, "appearance-none")}
            >
              <option value="">Pick a project…</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {about === "department" && !meeting ? (
          <Field label="Which department?">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              aria-label="Department"
              className={cn(inputClass, "appearance-none")}
            >
              <option value="">Pick a department…</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-micro font-medium text-muted">Who?</span>
            {people.length > 0 ? (
              <span className="text-micro tabular-nums text-muted">
                {who.size} of {people.length}
              </span>
            ) : null}
          </div>
          {about === "project" && !projectId ? (
            <p className="text-sm text-muted">Pick a project first.</p>
          ) : about === "department" && !departmentId ? (
            <p className="text-sm text-muted">Pick a department first.</p>
          ) : about === "project" && loadingPeople && people.length === 0 ? (
            <div className="h-[5.5rem] animate-pulse rounded-card bg-hover" aria-hidden />
          ) : people.length === 0 ? (
            <p className="text-sm text-muted">
              {about === "project" ? "Nobody is on this project yet — add people from the project page." : "Nobody here yet."}
            </p>
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
          {people.length > 0 && who.size === 0 ? <p className="mt-1 text-micro text-danger-ink">Pick at least one person.</p> : null}
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
            placeholder="e.g. Weekly catch-up"
            aria-label="What's it about"
            className={inputClass}
          />
        </Field>
      </div>
    </Sheet>
  );
}
