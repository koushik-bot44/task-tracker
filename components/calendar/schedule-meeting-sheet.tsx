"use client";

import { useEffect, useMemo, useState } from "react";
import { Face } from "@/components/ui/face";
import { Sheet } from "@/components/ui/sheet";
import { FormRow, snButton, snInput, snPrimary } from "@/components/work/sn";
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
  { key: "person", label: "People" },
];

type Candidate = { userId: string; name: string };

/**
 * Schedule a meeting: "About?" (a project / a department / everyone / chosen
 * people) — the choice fills the people by itself; "When?"; a short
 * description. The same sheet edits or cancels an existing meeting. A review
 * meeting never comes here — its day belongs to the milestone.
 *
 * It is dressed as the record behind it (owner, 2026-09-16: "convert the ui to
 * service now ui .. how current task inner ui looks"): the same 13px text, 1px
 * lines and labels down the left as components/work/sn.tsx, so scheduling a
 * meeting from a task does not look like a different program.
 */
export function ScheduleMeetingSheet({
  open,
  onClose,
  projectId: presetProjectId = null,
  projectName: presetProjectName,
  meeting,
  defaultDate,
  taskId: presetTaskId = null,
  taskTitle,
  people: presetPeople,
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
  /** Scheduled from a task's record: the meeting belongs to that task (owner, 2026-09-11). */
  taskId?: string | null;
  taskTitle?: string;
  /** A task's people: the only ones a task's meeting can invite, all ticked to start with. */
  people?: { userId: string; name: string }[];
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
  /** Narrows the people on screen; who is ticked is untouched by it. */
  const [findQ, setFindQ] = useState("");
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
    // A task's meeting is the task's alone: only its people can be invited (owner, 2026-09-11).
    if (presetPeople && (presetTaskId || meeting?.taskId)) return presetPeople;
    if (about === "project") return candidates ?? [];
    if (about === "department") return colleagues.filter((c) => (users ?? []).find((u) => u.id === c.userId)?.departmentId === departmentId);
    return colleagues;
  }, [about, candidates, colleagues, users, departmentId, presetPeople, presetTaskId, meeting?.taskId]);

  const shown = useMemo(() => {
    const needle = findQ.trim().toLowerCase();
    return needle ? people.filter((p) => p.name.toLowerCase().includes(needle)) : people;
  }, [people, findQ]);

  // Fresh every time it opens: an edit starts from the meeting, a new one
  // from the preset project and day.
  useEffect(() => {
    if (!open) return;
    setAbout(meeting ? (meeting.projectId ? "project" : "everyone") : presetTaskId ? "person" : "project");
    setProjectId(meeting?.projectId ?? presetProjectId);
    setDepartmentId("");
    setFindQ("");
    setSeededFor(null);
    setWho(new Set(meeting ? meeting.attendees.map((a) => a.userId) : []));
    setDate(meeting ? meeting.date.slice(0, 10) : defaultDate ?? dayInputValue(new Date()));
    setStart(meeting?.startTime ?? "10:00");
    setEnd(meeting?.endTime ?? "");
    setTitle(meeting?.title ?? "");
    setTitleTouched(Boolean(meeting));
  }, [open, meeting, presetProjectId, presetTaskId, defaultDate]);

  // The choice fills the people: a project's people, a department's people,
  // the whole company — all picked; "People" starts empty. An edit keeps
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
      // From a task, its people start ticked; otherwise "People" starts empty.
      setWho(new Set(presetTaskId ? (presetPeople ?? []).map((p) => p.userId) : []));
    }
    setSeededFor(seedKey);
  }, [open, meeting, about, seedKey, seededFor, projectId, departmentId, candidates, users, people, presetTaskId, presetPeople]);

  // The title follows the choice until the person writes their own.
  useEffect(() => {
    if (!open || titleTouched) return;
    if (about === "project") setTitle(projectName ? `${projectName} meeting` : "");
    else if (about === "department") setTitle(departmentName ? `${departmentName} meeting` : "");
    else if (about === "everyone") setTitle("Company meeting");
    else setTitle(presetTaskId && taskTitle ? taskTitle : "Catch-up");
  }, [open, titleTouched, about, projectName, departmentName, presetTaskId, taskTitle]);

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
      ...(presetTaskId && !meeting ? { taskId: presetTaskId } : {}),
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

  const subtitle =
    presetTaskId && !meeting
      ? taskTitle ?? null
      : about === "project"
        ? projectName
        : about === "department"
          ? departmentName
          : about === "everyone"
            ? "The whole company"
            : null;

  const saving = meeting ? updateEvent.isPending : createEvent.isPending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={meeting ? "Edit meeting" : "Schedule a meeting"}
      subtitle={subtitle ?? undefined}
      footer={
        /* The record's own buttons: small, square, to the right. */
        <div className="flex items-center justify-end gap-2">
          {meeting ? (
            <button
              type="button"
              onClick={cancelMeeting}
              disabled={pending}
              className={cn(snButton, "!border-danger !text-danger-ink hover:!bg-danger-soft")}
            >
              {deleteEvent.isPending ? "Cancelling…" : "Cancel meeting"}
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={pending} className={snButton}>
            Close
          </button>
          <button type="button" onClick={submit} disabled={!ready || pending} className={snPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      {/* One bordered form, labels down the left — the record's own shape. */}
      <div className="-mx-4 border-y border-line">
        <div className="divide-y divide-line/70">
          {presetProjectId || presetTaskId || meeting ? null : (
            <FormRow label="About">
              <select
                value={about}
                onChange={(e) => {
                  setAbout(e.target.value as About);
                  setFindQ("");
                  setSeededFor(null);
                }}
                aria-label="About what"
                className={snInput}
              >
                {ABOUT.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormRow>
          )}

          {about === "project" && !presetProjectId && !meeting ? (
            <FormRow label="Project" required>
              <select value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value || null)} aria-label="Project" className={snInput}>
                <option value="">Pick a project…</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormRow>
          ) : null}

          {about === "department" && !meeting ? (
            <FormRow label="Department" required>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Department" className={snInput}>
                <option value="">Pick a department…</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </FormRow>
          ) : null}

          <FormRow label="Short description" required>
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
              aria-label="What's it about"
              className={snInput}
            />
          </FormRow>

          <FormRow label="Day" required>
            <input
              type="date"
              value={date}
              min={meeting ? undefined : dayInputValue(new Date())}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Day"
              className={snInput}
            />
          </FormRow>

          <FormRow label="Starts" required>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" className={snInput} />
          </FormRow>

          <FormRow label="Ends">
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time" className={snInput} />
            {end && !endValid ? <p className="mt-1 text-[12px] text-danger-ink">The end has to be after the start.</p> : null}
          </FormRow>

          <FormRow label="People" required>
            {about === "project" && !projectId ? (
              <p className="text-[13px] text-muted">Pick a project first.</p>
            ) : about === "department" && !departmentId ? (
              <p className="text-[13px] text-muted">Pick a department first.</p>
            ) : about === "project" && loadingPeople && people.length === 0 ? (
              <div className="h-20 animate-pulse rounded-[3px] bg-hover" aria-hidden />
            ) : people.length === 0 ? (
              <p className="text-[13px] text-muted">
                {about === "project" ? "Nobody is on this project yet — add people from the project page." : "Nobody here yet."}
              </p>
            ) : (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[12px] tabular-nums text-muted">
                    {who.size} of {people.length} picked
                  </span>
                  {people.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setWho(who.size === people.length ? new Set() : new Set(people.map((p) => p.userId)))}
                      className="text-[12px] font-medium text-primary-ink hover:underline"
                    >
                      {who.size === people.length ? "None" : "All"}
                    </button>
                  ) : null}
                </div>
                {/* A company is too many names to scroll; find the one you mean. */}
                {people.length > 6 ? (
                  <input
                    value={findQ}
                    onChange={(e) => setFindQ(e.target.value)}
                    placeholder="Find a person"
                    aria-label="Find a person"
                    className={cn(snInput, "mb-1")}
                  />
                ) : null}
                <div role="group" aria-label="Who" className="max-h-52 overflow-y-auto rounded-[3px] border border-line">
                  {shown.length === 0 ? (
                    <p className="px-2 py-2 text-[13px] text-muted">Nobody matches &ldquo;{findQ.trim()}&rdquo;.</p>
                  ) : (
                    shown.map((p) => {
                      const on = who.has(p.userId);
                      return (
                        <button
                          key={p.userId}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggle(p.userId)}
                          className={cn(
                            "flex min-h-[32px] w-full items-center gap-2 border-b border-line/70 px-2 text-left text-[13px] last:border-b-0 hover:bg-hover",
                            on ? "bg-primary-soft/40" : "",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[2px] border text-[10px] font-bold",
                              on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-transparent",
                            )}
                          >
                            ✓
                          </span>
                          <Face name={p.name} size="sm" />
                          <span className="min-w-0 truncate text-ink">{p.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                {who.size === 0 ? <p className="mt-1 text-[12px] text-danger-ink">Pick at least one person.</p> : null}
              </div>
            )}
          </FormRow>
        </div>
      </div>
    </Sheet>
  );
}
