"use client";

import { UserPlus } from "lucide-react";
import { DeadlineChip } from "@/components/ui/chip";
import { Faces } from "@/components/ui/face";
import { cn } from "@/lib/cn";
import type { ProjectDTO, ProjectPersonDTO } from "@/lib/types";

/**
 * Name · faces (lead first) · deadline · a progress bar with its number.
 * Nothing else: no status words, no description.
 */
export function ProjectHeader({
  project,
  people,
  canManage,
  canSetProgress,
  onAddPeople,
  onSetProgress,
}: {
  project: ProjectDTO;
  people: ProjectPersonDTO[];
  canManage: boolean;
  canSetProgress: boolean;
  onAddPeople: () => void;
  onSetProgress: () => void;
}) {
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
        <DeadlineChip deadline={project.deadline} done={project.status === "DONE"} className="ml-auto" />
      </div>
      {canSetProgress ? (
        <button
          type="button"
          onClick={onSetProgress}
          aria-label={`Progress ${progress}%. Set progress`}
          className={cn("press -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-input px-1 py-1.5")}
        >
          {bar}
        </button>
      ) : (
        <div className="flex items-center gap-3 py-1.5" role="img" aria-label={`Progress ${progress}%`}>
          {bar}
        </div>
      )}
    </header>
  );
}
