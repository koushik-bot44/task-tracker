"use client";

import { CalendarClock, Clock, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { MeetingBreadcrumb } from "./meeting-breadcrumb";
import { ScheduleMeetingModal } from "./schedule-meeting-modal";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMeetings } from "@/lib/hooks/use-meetings";
import { formatDMY } from "@/lib/dates";
import type { CalendarEventDTO } from "@/lib/types";

/** Level 3: a project's meeting view — a Schedule action plus the history,
    upcoming first (editable) then past (view). */
export function MeetingsProject({ projectId }: { projectId: string }) {
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === projectId);
  const { data: departments } = useDepartments();
  const dept = departments?.find((d) => d.id === project?.departmentId);
  const { data: meetings, isLoading } = useMeetings();
  const [modal, setModal] = useState<{ meeting?: CalendarEventDTO } | null>(null);

  const { upcoming, past } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const mine = (meetings ?? []).filter((m) => m.projectId === projectId);
    const up = mine.filter((m) => new Date(m.date) >= startOfToday).sort((a, b) => a.date.localeCompare(b.date));
    const pa = mine.filter((m) => new Date(m.date) < startOfToday).sort((a, b) => b.date.localeCompare(a.date));
    return { upcoming: up, past: pa };
  }, [meetings, projectId]);

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      <MeetingBreadcrumb
        crumbs={[
          { label: "Meetings", href: "/meetings" },
          { label: dept?.name ?? "Department", href: dept ? `/meetings/department/${dept.id}` : undefined },
          { label: project?.name ?? "Project" },
        ]}
      />

      <header className="mb-4 mt-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 truncate font-display text-page font-bold text-ink">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project?.color ?? "var(--muted)" }} aria-hidden />
            {project?.name ?? "Project"}
          </h1>
          <p className="text-micro text-muted">Schedule meetings and review the history.</p>
        </div>
        {project ? (
          <button
            type="button"
            onClick={() => setModal({})}
            className="press flex h-9 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Schedule meeting
          </button>
        ) : null}
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-card bg-hover" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <Section title="Upcoming" count={upcoming.length}>
            {upcoming.length === 0 ? (
              <p className="card p-6 text-center text-sm text-muted">No upcoming meetings — schedule one above.</p>
            ) : (
              upcoming.map((m) => <MeetingItem key={m.id} meeting={m} onOpen={() => setModal({ meeting: m })} editable />)
            )}
          </Section>
          <Section title="Past" count={past.length}>
            {past.length === 0 ? (
              <p className="text-sm text-muted">No past meetings yet.</p>
            ) : (
              past.map((m) => <MeetingItem key={m.id} meeting={m} onOpen={() => setModal({ meeting: m })} />)
            )}
          </Section>
        </div>
      )}

      {modal && project ? (
        <ScheduleMeetingModal
          open
          onClose={() => setModal(null)}
          projectId={project.id}
          projectName={project.name}
          meeting={modal.meeting}
        />
      ) : null}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-micro font-semibold uppercase tracking-widest text-muted">
        {title}
        <span className="rounded-chip bg-hover px-1.5 tabular-nums text-muted">{count}</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MeetingItem({
  meeting,
  onOpen,
  editable,
}: {
  meeting: CalendarEventDTO;
  onOpen: () => void;
  editable?: boolean;
}) {
  const time = meeting.startTime ? `${meeting.startTime}${meeting.endTime ? `–${meeting.endTime}` : ""}` : "";
  return (
    <button type="button" onClick={onOpen} className="card lift block w-full p-4 text-left">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{meeting.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-micro text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {formatDMY(meeting.date)}
            </span>
            {time ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                {time}
              </span>
            ) : null}
          </p>
        </div>
        <span className={editable ? "shrink-0 text-micro font-medium text-primary-ink" : "shrink-0 text-micro text-muted"}>
          {editable ? "Edit" : "View"}
        </span>
      </div>
      {meeting.attendees.length > 0 ? (
        <p className="mt-2 flex items-start gap-1.5 text-micro text-muted">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0">{meeting.attendees.map((a) => a.name).join(", ")}</span>
        </p>
      ) : null}
      {meeting.description.trim() ? (
        <p className="mt-1.5 line-clamp-2 text-micro text-muted">{meeting.description}</p>
      ) : null}
    </button>
  );
}
