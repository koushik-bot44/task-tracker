"use client";

import Link from "next/link";
import { useState } from "react";
import { NotesThread } from "@/components/notes/notes-thread";
import { useCanManage } from "@/components/project/can-manage";
import { ProjectHeader } from "@/components/project/project-header";
import { AddPeopleSheet } from "@/components/sheets/add-people-sheet";
import { SetProgressSheet } from "@/components/sheets/set-progress-sheet";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkTable } from "@/components/work/work-table";
import { snButton, snInput } from "@/components/work/sn";
import { cn } from "@/lib/cn";
import { useMilestones } from "@/lib/hooks/use-milestones";
import { useProjectBySlug, useProjectPeople } from "@/lib/hooks/use-projects";
import { useWorkList } from "@/lib/hooks/use-work";
import { useMe } from "@/lib/hooks/use-users";
import { isFounderRole } from "@/lib/roles";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="w-full px-2 pb-10 pt-3 md:px-4">{children}</div>;
}

/**
 * /project/<slug> (work model, developer 2026-09-09): the project's header,
 * then its tasks as the service-desk table — every task, closed history
 * included — in place of the milestone boxes. New raises a task inside this
 * project; a row opens the record.
 */
export function ProjectTasksPage({ slug }: { slug: string }) {
  const { project, isLoading, isError, refetch } = useProjectBySlug(slug);
  const projectId = project?.id ?? null;
  const { data: people } = useProjectPeople(projectId);
  const canManage = useCanManage(project);
  const { data: me } = useMe();
  const canSetProgress = isFounderRole(me?.role);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  /** "project", or the milestone whose notes are open (2026-09-10). */
  const [notesFor, setNotesFor] = useState("project");
  const { data: milestones } = useMilestones(notesOpen ? projectId : null);
  const { data: all } = useWorkList({ projectId: projectId ?? "", open: "false", limit: 200 }, Boolean(projectId));

  if (isLoading && !project) {
    return (
      <Shell>
        <Skeleton rows={4} />
      </Shell>
    );
  }
  if (isError && !project) {
    return (
      <Shell>
        <ErrorState onRetry={() => refetch()} />
      </Shell>
    );
  }
  if (!project) {
    return (
      <Shell>
        <EmptyState
          title="No project with that address."
          body="It may have been renamed or removed."
          action={
            <Link href="/projects" className="press inline-flex h-11 items-center rounded-input bg-hover px-4 text-sm font-semibold text-ink">
              All projects
            </Link>
          }
        />
      </Shell>
    );
  }

  const roots = (all?.items ?? []).filter((t) => t.parentId === null);
  const milestone = notesFor === "project" ? null : (milestones ?? []).find((m) => m.id === notesFor) ?? null;
  return (
    <Shell>
      <div className="mx-auto max-w-content">
        <ProjectHeader project={project} people={people ?? project.people} canManage={canManage} canSetProgress={canSetProgress} onAddPeople={() => setPeopleOpen(true)} onSetProgress={() => setProgressOpen(true)} />
      </div>
      <div className="mt-4">
        <WorkTable
          fixed={{ projectId: project.id }}
          title={<span>Tasks · {project.name}</span>}
          defaultSlice="everything"
          hideProject
          presetProjectId={project.id}
          presetDepartmentId={project.departmentId}
          headerRight={
            <button type="button" onClick={() => setNotesOpen(true)} className={snButton}>
              Project notes
            </button>
          }
        />
      </div>

      <AddPeopleSheet open={peopleOpen} onClose={() => setPeopleOpen(false)} projectId={project.id} />
      {canSetProgress ? (
        <SetProgressSheet open={progressOpen} onClose={() => setProgressOpen(false)} project={project} done={roots.filter((t) => t.status === "DONE").length} total={roots.length} />
      ) : null}
      <Drawer
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        label="Project notes"
        fill
        header={
          <div className="min-w-0">
            <h2 className="truncate text-section font-semibold text-ink">{milestone ? `${milestone.name} notes` : "Project notes"}</h2>
            <p className="truncate text-micro text-muted">{project.name}</p>
          </div>
        }
      >
        {/* Each milestone keeps its own notes and files; they are read and
            written here, beside the project's (2026-09-10). */}
        {milestones?.length ? (
          <div className="shrink-0 border-b border-line px-3 py-2">
            <label className="flex items-center gap-2 text-micro font-medium text-muted">
              <span className="shrink-0">Notes for</span>
              <select value={milestone?.id ?? "project"} onChange={(e) => setNotesFor(e.target.value)} aria-label="Notes for" className={cn(snInput, "min-w-0 flex-1")}>
                <option value="project">The whole project</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <NotesThread key={milestone?.id ?? "project"} targetType={milestone ? "MILESTONE" : "PROJECT"} targetId={milestone?.id ?? project.id} autoFocus fill />
      </Drawer>
    </Shell>
  );
}
