"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { PriorityChip } from "@/components/projects/project-card";
import { PrioritySheet } from "@/components/sheets/priority-sheet";
import { DeadlineChip } from "@/components/ui/chip";
import { Faces } from "@/components/ui/face";
import type { ProjectDTO, ProjectPersonDTO } from "@/lib/types";

/**
 * Name · faces (lead first) · priority (P1 / P2 / P3) · deadline · a progress
 * bar with its number. The number is tasks done over tasks in the project —
 * nobody sets it. People who manage the project tap the priority chip to
 * change it. Nothing else: no status words, no description.
 */
export function ProjectHeader({
  project,
  people,
  canManage,
  onAddPeople,
}: {
  project: ProjectDTO;
  people: ProjectPersonDTO[];
  canManage: boolean;
  onAddPeople: () => void;
}) {
  const [priorityOpen, setPriorityOpen] = useState(false);
  const done = project.status === "DONE";
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
      <h1 className="text-page font-semibold text-ink">{project.name}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Faces names={people.map((p) => p.name)} max={4} />
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
        <PriorityChip
          priority={project.priority}
          muted={done}
          onClick={canManage ? () => setPriorityOpen(true) : undefined}
          className="ml-auto"
        />
        <DeadlineChip deadline={project.deadline} done={done} />
      </div>
      <div className="flex items-center gap-3 py-1.5" role="img" aria-label={`${progress}% of tasks done`}>
        {bar}
      </div>
      {canManage ? <PrioritySheet open={priorityOpen} onClose={() => setPriorityOpen(false)} project={project} /> : null}
    </header>
  );
}
