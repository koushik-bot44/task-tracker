"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useId } from "react";
import { ProjectCard } from "@/components/projects/project-card";
import { Button, IconButton } from "@/components/ui/button";
import type { ProjectDTO } from "@/lib/types";

/**
 * A department on the Projects page: a small uppercase label, the "⋯" for
 * the people who may edit the department, "+ New project" for the people who
 * may start one here, then the cards. An empty department is one muted line.
 */
export function DepartmentSection({
  title,
  projects,
  canEdit = false,
  canStart = false,
  onEdit,
  onStart,
}: {
  title: string;
  projects: ProjectDTO[];
  canEdit?: boolean;
  canStart?: boolean;
  onEdit?: () => void;
  onStart?: () => void;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <div className="flex min-h-11 items-center gap-1">
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-micro font-semibold uppercase tracking-[0.08em] text-muted">
          {title}
        </h2>
        {canEdit && onEdit ? (
          <IconButton label={`Edit ${title}`} onClick={onEdit}>
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </IconButton>
        ) : null}
        {canStart && onStart ? (
          <Button variant="secondary" onClick={onStart} icon={<Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />}>
            New project
          </Button>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <p className="mt-1 px-1 text-sm text-muted">No projects yet</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
