"use client";

import { ChevronLeft, Pencil, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PriorityChip } from "@/components/projects/project-card";
import { PrioritySheet } from "@/components/sheets/priority-sheet";
import { ProjectDetailsSheet } from "@/components/sheets/project-details-sheet";
import { ProjectLookSheet } from "@/components/sheets/project-look-sheet";
import { Button, IconButton } from "@/components/ui/button";
import { DeadlineChip } from "@/components/ui/chip";
import { Face, Faces } from "@/components/ui/face";
import { wearsNoDesignation } from "@/lib/roles";
import { ProjectMark } from "@/components/ui/project-mark";
import { Sheet } from "@/components/ui/sheet";
import { ROLE_LABEL, type ProjectDTO, type ProjectPersonDTO } from "@/lib/types";

/**
 * A way back to the department's projects · the project's mark (tap to change
 * its look) · name · faces (lead first) · priority (P1 / P2 / P3) · deadline ·
 * a progress bar with its number (tasks done over tasks, or the CEO's own).
 * Nothing else: no status words, no description.
 */
export function ProjectHeader({
  project,
  people,
  canManage,
  canSetProgress = false,
  onAddPeople,
  onSetProgress,
}: {
  project: ProjectDTO;
  people: ProjectPersonDTO[];
  canManage: boolean;
  /** The CEO alone: tap the bar to set the number by hand. */
  canSetProgress?: boolean;
  onAddPeople: () => void;
  onSetProgress?: () => void;
}) {
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const done = project.status === "DONE";
  const backHref = project.departmentId ? `/projects?d=${encodeURIComponent(project.departmentId)}` : "/projects";
  const mark = <ProjectMark name={project.name} color={project.color} icon={project.icon} logoUrl={project.logoUrl} size="lg" />;
  const progress = Math.max(0, Math.min(100, Math.round(project.progress)));
  const bar = (
    <>
      <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-hover" aria-hidden>
        <span className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }} />
      </span>
      <span className="w-12 shrink-0 text-right text-sm font-semibold text-ink">{progress}%</span>
    </>
  );

  return (
    <header className="space-y-3">
      <Link href={backHref} className="press -ml-2 inline-flex h-11 items-center gap-0.5 rounded-chip pl-1 pr-3 text-sm font-medium text-primary">
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        Projects
      </Link>
      <div className="flex items-start gap-3">
        {canManage ? (
          <button type="button" onClick={() => setLookOpen(true)} aria-label="Change the project's look" title="Change the look" className="press shrink-0 rounded-card">
            {mark}
          </button>
        ) : (
          mark
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-page font-semibold leading-tight text-ink">{project.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWhoOpen(true)}
              aria-label={`Who is on this project — ${people.length} ${people.length === 1 ? "person" : "people"}`}
              title="Who is on this project"
              className="press rounded-chip"
            >
              <Faces names={people.map((p) => p.name)} max={4} />
            </button>
            {canManage ? (
              <button
                type="button"
                onClick={onAddPeople}
                className="press inline-flex h-9 items-center gap-1.5 rounded-chip px-2.5 text-micro font-medium text-muted hover:text-ink"
              >
                <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Add people
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PriorityChip priority={project.priority} muted={done} onClick={canManage ? () => setPriorityOpen(true) : undefined} />
        {canManage ? (
          <button type="button" onClick={() => setDetailsOpen(true)} aria-label="Change the deadline and details" title="Change the deadline" className="press rounded-chip">
            <DeadlineChip deadline={project.deadline} done={done} />
          </button>
        ) : (
          <DeadlineChip deadline={project.deadline} done={done} />
        )}
        {canManage ? (
          <IconButton label="Edit project" onClick={() => setDetailsOpen(true)} className="ml-auto">
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </IconButton>
        ) : null}
      </div>
      {canSetProgress && onSetProgress ? (
        <button
          type="button"
          onClick={onSetProgress}
          aria-label={`${progress}% done${project.progressManual !== null ? ", set by hand" : ""}. Change the number`}
          className="press -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-input px-1 py-1.5"
        >
          {bar}
        </button>
      ) : (
        <div className="flex items-center gap-3 py-1.5" role="img" aria-label={`${progress}% done`}>
          {bar}
        </div>
      )}
      {canManage ? <PrioritySheet open={priorityOpen} onClose={() => setPriorityOpen(false)} project={project} /> : null}
      {canManage ? <ProjectLookSheet open={lookOpen} onClose={() => setLookOpen(false)} project={project} /> : null}
      <Sheet
        open={whoOpen}
        onClose={() => setWhoOpen(false)}
        title="On this project"
        subtitle={`${people.length} ${people.length === 1 ? "person" : "people"} · ${project.name}`}
        footer={
          canManage ? (
            <Button variant="primary" full onClick={() => { setWhoOpen(false); onAddPeople(); }}>
              Add people
            </Button>
          ) : undefined
        }
      >
        <ul className="divide-y divide-line">
          {[...people]
            // The people running it first, then whoever is carrying the most.
            .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || Number(b.isLead) - Number(a.isLead) || b.taskCount - a.taskCount || a.name.localeCompare(b.name))
            .map((p) => (
              <li key={p.id} className="flex min-h-[56px] items-center gap-3 px-1">
                <Face name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-row text-ink">{p.name}</span>
                  <span className="block truncate text-micro text-muted">
                    {[p.isOwner ? "Runs it" : null, p.isLead ? "Lead" : null, wearsNoDesignation(p.role) ? null : ROLE_LABEL[p.role]].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-micro text-muted">
                  {p.taskCount === 0 ? "no tasks" : `${p.taskCount} ${p.taskCount === 1 ? "task" : "tasks"}`}
                </span>
              </li>
            ))}
          {people.length === 0 ? <li className="py-6 text-center text-sm text-muted">Nobody is on this project yet.</li> : null}
        </ul>
      </Sheet>

      {canManage ? <ProjectDetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} project={project} people={people} /> : null}
    </header>
  );
}
