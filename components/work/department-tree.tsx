"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { DepartmentMark } from "@/components/ui/department-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDMY } from "@/lib/dates";
import { useProjects } from "@/lib/hooks/use-projects";
import { useWorkList, type WorkQuery } from "@/lib/hooks/use-work";
import { TaskTable } from "./task-table";
import type { DepartmentDTO, ProjectDTO } from "@/lib/types";

/**
 * Departments, opened up.
 *
 * A department opens to the projects inside it; a project opens to its tasks,
 * hardest first — critical at the top, then high, and so on. Nothing is
 * fetched until it is opened, so a company with nine departments costs one
 * request until somebody actually looks inside one.
 *
 * Everything set above — the Show slice, the search, and anything under More
 * filters — narrows what appears inside, so the grouping is a way of reading
 * the same list rather than an escape from it.
 */
export function DepartmentTree({ departments, filter }: { departments: DepartmentDTO[]; filter: WorkQuery }) {
  const { data: projects } = useProjects();
  const [openDept, setOpenDept] = useState<string | null>(departments.length === 1 ? departments[0].id : null);
  const [openProject, setOpenProject] = useState<string | null>(null);

  if (departments.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-muted">No departments to show.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {departments.map((d) => {
        const open = openDept === d.id;
        const inIt = (projects ?? []).filter((p) => p.departmentId === d.id);
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => { setOpenDept(open ? null : d.id); setOpenProject(null); }}
              aria-expanded={open}
              className="press flex min-h-[48px] w-full items-center gap-2 px-3 py-2 text-left hover:bg-hover"
            >
              <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted transition-transform duration-150", open && "rotate-90")} strokeWidth={2} aria-hidden />
              <DepartmentMark name={d.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{d.name}</span>
              <span className="shrink-0 text-micro text-muted">
                {inIt.length} {inIt.length === 1 ? "project" : "projects"}
              </span>
            </button>

            {open ? (
              <ul className="border-t border-line bg-hover/30">
                {inIt.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    departmentId={d.id}
                    open={openProject === p.id}
                    onToggle={() => setOpenProject(openProject === p.id ? null : p.id)}
                    filter={filter}
                  />
                ))}
                {/* Work in the department that belongs to no project still has to be findable. */}
                <ProjectRow
                  key="none"
                  project={null}
                  departmentId={d.id}
                  open={openProject === `none:${d.id}`}
                  onToggle={() => setOpenProject(openProject === `none:${d.id}` ? null : `none:${d.id}`)}
                  filter={filter}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ProjectRow({
  project,
  departmentId,
  open,
  onToggle,
  filter,
}: {
  /** Null = the department's work that sits in no project. */
  project: ProjectDTO | null;
  departmentId: string;
  open: boolean;
  onToggle: () => void;
  filter: WorkQuery;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="press flex min-h-[44px] w-full items-center gap-2 py-2 pl-9 pr-3 text-left hover:bg-hover"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150", open && "rotate-90")} strokeWidth={2} aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate text-[13px]", project ? "text-ink" : "italic text-muted")}>
          {project ? project.name : "No project"}
        </span>
        {project?.deadline ? <span className="shrink-0 text-micro text-muted">due {formatDMY(project.deadline)}</span> : null}
      </button>
      {open ? <TasksInProject departmentId={departmentId} projectId={project?.id ?? null} filter={filter} /> : null}
    </li>
  );
}

/**
 * A project's tasks, hardest first — shown in the ordinary list, so a row here
 * reads exactly as it does in the queue. Only asked for once it is opened.
 */
function TasksInProject({ departmentId, projectId, filter }: { departmentId: string; projectId: string | null; filter: WorkQuery }) {
  // The page's own filters, narrowed to this department and project. Hardest
  // first unless the reader chose another order above.
  const { data, isLoading } = useWorkList(
    { ...filter, departmentId, sort: filter.sort ?? "priority", limit: 100, ...(projectId ? { projectId } : {}) },
    true,
  );

  if (isLoading) return <div className="p-3"><Skeleton rows={2} /></div>;
  // Without a project id the list still carries the whole department, so the
  // ones already filed under a project are dropped here.
  const items = (data?.items ?? []).filter((t) => (projectId ? t.projectId === projectId : t.projectId === null));

  // Everyone holding the same task, so the row can say so here too.
  const sharedWith = new Map<string, string[]>();
  for (const t of items) {
    if (!t.siblingKey) continue;
    const names = [...(t.assigneeName ? [t.assigneeName] : []), ...t.alsoWith.map((p) => p.name)];
    if (names.length > 1) sharedWith.set(t.id, names);
  }

  return (
    <div className="border-t border-line bg-surface">
      <TaskTable items={items} sharedWith={sharedWith} empty="No tasks here." />
    </div>
  );
}
