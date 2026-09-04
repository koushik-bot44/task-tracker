"use client";

import { generateKeyBetween } from "fractional-indexing";
import { ChevronDown, ChevronRight, ChevronUp, FolderPlus, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useCollapse } from "@/lib/hooks/use-collapse";
import {
  usePersonalDepartmentMutations,
  usePersonalDepartments,
  usePersonalProjectMutations,
  usePersonalProjects,
  type PersonalDepartmentDTO,
  type PersonalProjectDTO,
} from "@/lib/hooks/use-personal";
import { usePrivateTasks, useTaskMutations } from "@/lib/hooks/use-tasks";
import { useMe } from "@/lib/hooks/use-users";
import { descendantIds } from "@/lib/tree";
import type { TaskDTO } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { PromptComposer } from "@/components/my-space/prompt-composer";
import { TreeCore, type TreeSource } from "@/components/tree/tree-view";

/**
 * My Space (phase 33) — a person's PRIVATE Department > Project > Task hierarchy,
 * replacing the phase-15 flat labels. Everything here is the caller's own and
 * isolated on the server: no lead, manager or admin can see it, and it never
 * surfaces in any project view or dashboard. The task outline under each project
 * is the very same tree the project tools use (TreeCore) in "personal" mode —
 * simple: title, status and notes only, no gates/assignees/dates/priority.
 * The "Prompt" quick-capture is RESOURCE-only.
 */
export function MySpace() {
  const { data: me } = useMe();
  const { data: departments } = usePersonalDepartments();
  const { data: projects } = usePersonalProjects();
  const { data: tasks } = usePrivateTasks();
  const [promptOpen, setPromptOpen] = useState(false);

  if (!me) return <div className="px-4 py-16 text-center text-sm text-muted">Loading…</div>;
  const isDeveloper = me.role === "RESOURCE";
  const depts = departments ?? [];
  const empty = depts.length === 0;

  return (
    <div className="px-4 py-4 pb-32 sm:px-8 sm:py-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-page-lg font-bold text-ink">My Space</h1>
          <p className="mt-0.5 text-sm text-muted">
            Your private departments, projects and tasks. Only you can see these.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDeveloper ? (
            <button
              type="button"
              onClick={() => setPromptOpen(true)}
              className="press flex h-9 shrink-0 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary"
            >
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
              Prompt
            </button>
          ) : null}
          <NewDepartmentButton />
        </div>
      </header>

      {empty ? (
        <EmptyMySpace />
      ) : (
        <div className="space-y-3">
          {depts.map((dept, i) => (
            <DepartmentSection
              key={dept.id}
              dept={dept}
              projects={(projects ?? []).filter((p) => p.departmentId === dept.id)}
              tasks={tasks ?? []}
              ownerId={me.id}
              prev={depts[i - 1] ?? null}
              next={depts[i + 1] ?? null}
              siblings={depts}
              index={i}
            />
          ))}
        </div>
      )}

      {isDeveloper ? (
        <PromptComposer open={promptOpen} onClose={() => setPromptOpen(false)} projects={projects ?? []} />
      ) : null}
    </div>
  );
}

/** move `item` one slot up/down among ordered `siblings` via a fresh fractional key. */
function reorderKey(siblings: { orderKey: string }[], index: number, dir: -1 | 1): string | null {
  const target = index + dir;
  if (target < 0 || target >= siblings.length) return null;
  // Moving up: land between the item now two slots up and the one directly above.
  // Moving down: land between the one directly below and the one two slots below.
  const [a, b] =
    dir === -1
      ? [siblings[index - 2]?.orderKey ?? null, siblings[index - 1].orderKey]
      : [siblings[index + 1].orderKey, siblings[index + 2]?.orderKey ?? null];
  return generateKeyBetween(a, b);
}

function DepartmentSection({
  dept,
  projects,
  tasks,
  ownerId,
  siblings,
  index,
}: {
  dept: PersonalDepartmentDTO;
  projects: PersonalProjectDTO[];
  tasks: TaskDTO[];
  ownerId: string;
  prev: PersonalDepartmentDTO | null;
  next: PersonalDepartmentDTO | null;
  siblings: PersonalDepartmentDTO[];
  index: number;
}) {
  const { updateDepartment, deleteDepartment } = usePersonalDepartmentMutations();
  const { createProject } = usePersonalProjectMutations();
  const { show: toast } = useToast();
  const collapse = useCollapse(`pdept:${dept.id}`);
  const open = !collapse.collapsed.has(dept.id);
  const [adding, setAdding] = useState(false);

  const move = (dir: -1 | 1) => {
    const orderKey = reorderKey(siblings, index, dir);
    if (orderKey) updateDepartment.mutate({ id: dept.id, patch: { orderKey } });
  };

  const onDelete = () => {
    if (dept.projectCount > 0) {
      toast({ message: "Empty this department first — move or delete its projects.", tone: "danger" });
      return;
    }
    if (!window.confirm(`Delete the department "${dept.name}"?`)) return;
    deleteDepartment.mutate(dept.id, {
      onSuccess: () => toast({ message: `Deleted "${dept.name}"` }),
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line px-2 py-2">
        <button
          type="button"
          onClick={() => collapse.toggle(dept.id)}
          aria-label={open ? "Collapse" : "Expand"}
          className="press grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink"
        >
          {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
        </button>
        <InlineName
          value={dept.name}
          onRename={(name) => updateDepartment.mutate({ id: dept.id, patch: { name } })}
          className="text-sm font-semibold text-ink"
        />
        <span className="shrink-0 text-micro tabular-nums text-muted">{dept.projectCount}</span>
        <ReorderButtons canUp={index > 0} canDown={index < siblings.length - 1} onMove={move} />
        <button
          type="button"
          onClick={() => { collapse.setFor(dept.id, false); setAdding(true); }}
          aria-label="New project"
          title="New project"
          className="press grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink"
        >
          <FolderPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete department"
          className="press grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-danger-ink"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      {open ? (
        <div className="space-y-2 p-2">
          {projects.map((project, i) => (
            <ProjectSection
              key={project.id}
              project={project}
              tasks={tasks}
              ownerId={ownerId}
              siblings={projects}
              index={i}
            />
          ))}
          {adding ? (
            <NewProjectRow
              onCreate={(name) =>
                createProject.mutate(
                  { departmentId: dept.id, name },
                  { onSettled: () => setAdding(false) },
                )
              }
              onCancel={() => setAdding(false)}
            />
          ) : projects.length === 0 ? (
            <p className="px-2 py-1 text-micro text-muted">No projects yet — add one.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProjectSection({
  project,
  tasks,
  ownerId,
  siblings,
  index,
}: {
  project: PersonalProjectDTO;
  tasks: TaskDTO[];
  ownerId: string;
  siblings: PersonalProjectDTO[];
  index: number;
}) {
  const { updateProject, deleteProject } = usePersonalProjectMutations();
  const { show: toast } = useToast();
  const mutations = useTaskMutations({ kind: "private", personalProjectId: project.id, ownerId });
  const collapse = useCollapse(`pproj:${project.id}`);
  const open = !collapse.collapsed.has(project.id);

  // This project's task outline: its roots plus their whole subtrees.
  const projectTasks = useMemo(() => {
    const roots = tasks.filter((t) => t.parentId === null && t.personalProjectId === project.id);
    const ids = new Set<string>();
    for (const r of roots) {
      ids.add(r.id);
      for (const d of descendantIds(tasks, r.id)) ids.add(d);
    }
    return tasks.filter((t) => ids.has(t.id));
  }, [tasks, project.id]);
  const rootCount = projectTasks.filter((t) => t.parentId === null).length;

  const source: TreeSource = {
    id: `pproj:${project.id}`,
    rootName: project.name,
    tasks: projectTasks,
    isLoading: false,
    isError: false,
    refetch: () => {},
    canEdit: true,
    requireDates: false,
    compact: true,
    personal: true,
    collapsed: collapse.collapsed,
    toggleCollapse: collapse.toggle,
    setCollapsedFor: collapse.setFor,
    ...mutations,
  };

  const move = (dir: -1 | 1) => {
    const orderKey = reorderKey(siblings, index, dir);
    if (orderKey) updateProject.mutate({ id: project.id, patch: { orderKey } });
  };

  const onDelete = () => {
    if (!window.confirm(`Delete the project "${project.name}"${rootCount > 0 ? ` and its ${rootCount} task${rootCount === 1 ? "" : "s"}` : ""}?`)) return;
    deleteProject.mutate(project.id, {
      onSuccess: () => toast({ message: `Deleted "${project.name}"` }),
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };

  return (
    <div className="overflow-hidden rounded-card border border-line bg-bg">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => collapse.toggle(project.id)}
          aria-label={open ? "Collapse" : "Expand"}
          className="press grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <InlineName
          value={project.name}
          onRename={(name) => updateProject.mutate({ id: project.id, patch: { name } })}
          className="text-sm font-medium text-ink"
        />
        <span className="shrink-0 text-micro tabular-nums text-muted">{rootCount}</span>
        <ReorderButtons canUp={index > 0} canDown={index < siblings.length - 1} onMove={move} />
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete project"
          className="press grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-danger-ink"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
      {open ? <TreeCore source={source} /> : null}
    </div>
  );
}

/** Click-to-rename text that becomes an input; commits on Enter/blur, Esc reverts. */
function InlineName({
  value,
  onRename,
  className,
}: {
  value: string;
  onRename: (name: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onRename(next);
    else setDraft(value);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        aria-label="Rename"
        className="min-w-0 flex-1 rounded-input border border-line bg-bg px-2 py-0.5 text-sm text-ink outline-none focus:border-primary"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Rename"
      className={cn("min-w-0 flex-1 truncate text-left", className)}
    >
      {value}
    </button>
  );
}

function ReorderButtons({
  canUp,
  canDown,
  onMove,
}: {
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <span className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={!canUp}
        aria-label="Move up"
        className="press grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={!canDown}
        aria-label="Move down"
        className="press grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

function NewDepartmentButton() {
  const { createDepartment } = usePersonalDepartmentMutations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = () => {
    const next = name.trim();
    if (!next) return;
    createDepartment.mutate({ name: next }, { onSuccess: () => setName("") });
    setName("");
    setOpen(false);
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press flex h-9 shrink-0 items-center gap-1.5 rounded-card border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-hover"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        New department
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setOpen(false); }}
        placeholder="Department name"
        aria-label="New department name"
        className="h-9 w-44 rounded-input border border-line bg-bg px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
      />
      <button
        type="button"
        onClick={create}
        disabled={createDepartment.isPending}
        aria-label="Create department"
        className="press grid h-9 w-9 place-items-center rounded-card bg-primary text-on-primary disabled:opacity-50"
      >
        {createDepartment.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Cancel"
        className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:bg-hover"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function NewProjectRow({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const create = () => { const next = name.trim(); if (next) onCreate(next); };
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") onCancel(); }}
        placeholder="Project name"
        aria-label="New project name"
        className="h-8 min-w-0 flex-1 rounded-input border border-line bg-surface px-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
      />
      <button type="button" onClick={create} aria-label="Create project" className="press grid h-8 w-8 place-items-center rounded-card bg-primary text-on-primary">
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onCancel} aria-label="Cancel" className="press grid h-8 w-8 place-items-center rounded-card text-muted hover:bg-hover">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function EmptyMySpace() {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-6 py-16 text-center">
      <p className="font-display text-xl text-ink">Your private space is empty</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
        A personal workspace nobody else can see. Make a department, add a project
        inside it, then break the work into tasks and subtasks.
      </p>
    </div>
  );
}
