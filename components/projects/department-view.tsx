"use client";

import { ChevronLeft, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { ProjectCard } from "@/components/projects/project-card";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import type { DepartmentDTO, ProjectDTO } from "@/lib/types";

type View = "all" | "mine" | "behind";

/** Behind first, then the rest in their order, finished projects last. */
function rank(p: ProjectDTO): number {
  if (p.status === "DONE") return 2;
  if (p.behind) return 0;
  return 1;
}

export function byRankThenOrder(a: ProjectDTO, b: ProjectDTO): number {
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  return a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0;
}

/**
 * One department, opened from the Projects list: a way back, the name, how
 * many projects live here, All / Mine / Behind, then the cards. "+ New
 * project" starts one in this department.
 */
export function DepartmentView({
  department,
  projects,
  isMine,
  canEdit,
  canStart,
  onBack,
  onEdit,
  onStart,
}: {
  department: DepartmentDTO;
  projects: ProjectDTO[];
  isMine: (p: ProjectDTO) => boolean;
  canEdit: boolean;
  canStart: boolean;
  onBack: () => void;
  onEdit: () => void;
  onStart: () => void;
}) {
  const [view, setView] = useState<View>("all");
  const mineCount = projects.filter(isMine).length;
  const behindCount = projects.filter((p) => p.behind && p.status !== "DONE").length;
  const shown = projects
    .filter((p) => (view === "mine" ? isMine(p) : view === "behind" ? p.behind && p.status !== "DONE" : true))
    .sort(byRankThenOrder);

  const countLine =
    projects.length === 0
      ? "No projects yet"
      : `${projects.length} ${projects.length === 1 ? "project" : "projects"}${behindCount > 0 ? ` · ${behindCount} behind` : ""}`;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="press -ml-2 flex h-11 items-center gap-0.5 rounded-chip pl-1 pr-3 text-sm font-medium text-primary"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        Projects
      </button>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-section font-semibold leading-tight text-ink">{department.name}</h1>
          <p className="mt-0.5 text-sm text-muted">{countLine}</p>
        </div>
        {canEdit ? (
          <IconButton label={`Edit ${department.name}`} onClick={onEdit}>
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </IconButton>
        ) : null}
        {canStart && projects.length > 0 ? (
          <Button variant="primary" onClick={onStart} icon={<Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />}>
            New project
          </Button>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet."
          body={canStart ? "Start one and it shows up here." : "When one starts here, it shows up."}
          action={
            canStart ? (
              <Button variant="primary" onClick={onStart} icon={<Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />}>
                New project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {projects.length > 1 ? (
            <Segmented<View>
              label="Which projects"
              value={view}
              onChange={setView}
              className="md:max-w-sm"
              options={[
                { value: "all", label: "All" },
                { value: "mine", label: "Mine", count: mineCount },
                { value: "behind", label: "Behind", count: behindCount },
              ]}
            />
          ) : null}
          {shown.length === 0 ? (
            <EmptyState title={view === "mine" ? "You're not on a project here." : "Nothing is behind."} />
          ) : (
            <ul className="space-y-3">
              {shown.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
