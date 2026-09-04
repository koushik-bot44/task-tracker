"use client";

import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { FirstRunHint } from "@/components/first-run-hint";
import { TaskTitle } from "@/components/task-title";
import { DuePill } from "@/components/tree/task-meta";
import { cn } from "@/lib/cn";
import { dateState } from "@/lib/dates";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjects } from "@/lib/hooks/use-projects";
import { useAllTasks } from "@/lib/hooks/use-tasks";
import { useMe } from "@/lib/hooks/use-users";
import { STATUS_STYLE } from "@/lib/status";
import { startOfIsoWeekLocal } from "@/lib/weeks";
import type { TaskDTO } from "@/lib/types";

/**
 * A developer's home answers one question: what is mine, and what is on fire.
 *
 * Grouped by urgency rather than by tool, because "which tool is this in" is a
 * detail and "this was due yesterday" is not. No new endpoint — the existing
 * all-tasks query already carries the assignee, so this is a filter.
 */
export function MyWork() {
  const { data: me } = useMe();
  const { data: tasks, isLoading } = useAllTasks();
  const { data: projects } = useProjects();
  const { openTask } = usePanelParams();

  const projectById = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p])),
    [projects],
  );

  const groups = useMemo(() => {
    const mine = (tasks ?? []).filter((t) => t.assigneeId && t.assigneeId === me?.id);
    const open = mine.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");

    const overdue: TaskDTO[] = [];
    const atRisk: TaskDTO[] = [];
    const inProgress: TaskDTO[] = [];
    const upcoming: TaskDTO[] = [];

    for (const t of open) {
      const st = dateState(t.dueDate, t.status);
      if (st === "overdue") overdue.push(t);
      else if (st === "at-risk") atRisk.push(t);
      else if (t.status === "IN_PROGRESS") inProgress.push(t);
      else upcoming.push(t);
    }

    const weekStart = startOfIsoWeekLocal(new Date()).getTime();
    const doneThisWeek = mine.filter(
      (t) => t.completedAt && Date.parse(t.completedAt) >= weekStart,
    ).length;

    const byDate = (a: TaskDTO, b: TaskDTO) =>
      (a.dueDate ? Date.parse(a.dueDate) : Number.MAX_SAFE_INTEGER) -
      (b.dueDate ? Date.parse(b.dueDate) : Number.MAX_SAFE_INTEGER);

    return {
      overdue: overdue.sort(byDate),
      atRisk: atRisk.sort(byDate),
      inProgress: inProgress.sort(byDate),
      upcoming: upcoming.sort(byDate),
      doneThisWeek,
      total: open.length,
    };
  }, [tasks, me]);

  if (isLoading) {
    return (
      <div className="space-y-3 px-4 py-4 sm:px-8 sm:py-6" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-hover" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl px-4 py-4 sm:px-8 sm:py-6">
      <FirstRunHint id="my-work">
        Everything assigned to you, most urgent first.
      </FirstRunHint>

      <header className="card flex items-center gap-4 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok-soft">
          <CheckCircle2 className="h-5 w-5 text-ok-ink" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <p className="font-display text-page-lg font-bold tabular-nums text-ink">
            {groups.doneThisWeek}
          </p>
          <p className="text-sm text-muted">
            finished this week · {groups.total} still open
          </p>
        </div>
      </header>

      {groups.total === 0 ? (
        <p className="card mt-3 p-8 text-center text-sm text-muted">
          Nothing is assigned to you right now. Pick something up from a project, or
          ask your team lead.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <Group
            title="Overdue"
            tone="danger"
            tasks={groups.overdue}
            projectById={projectById}
            onOpen={openTask}
          />
          <Group
            title="At risk"
            tone="warn"
            tasks={groups.atRisk}
            projectById={projectById}
            onOpen={openTask}
          />
          <Group
            title="In progress"
            tone="primary"
            tasks={groups.inProgress}
            projectById={projectById}
            onOpen={openTask}
          />
          <Group
            title="Upcoming"
            tone="muted"
            tasks={groups.upcoming}
            projectById={projectById}
            onOpen={openTask}
          />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  tone,
  tasks,
  projectById,
  onOpen,
}: {
  title: string;
  tone: "danger" | "warn" | "primary" | "muted";
  tasks: TaskDTO[];
  projectById: Map<string, { name: string; color: string }>;
  onOpen: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="card overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            tone === "danger" && "bg-danger-ink",
            tone === "warn" && "bg-warn-ink",
            tone === "primary" && "bg-primary",
            tone === "muted" && "bg-muted",
          )}
          aria-hidden
        />
        <span className="flex-1 text-ink">{title}</span>
        <span className="text-micro font-normal tabular-nums text-muted">
          {tasks.length}
        </span>
      </h2>
      <ul className="divide-y divide-line">
        {tasks.map((t) => {
          const tool = projectById.get(t.projectId ?? "");
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-hover"
              >
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_STYLE[t.status].dot)}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    <TaskTitle title={t.title} />
                  </span>
                  <span className="block truncate text-micro text-muted">
                    {tool?.name ?? ""}
                  </span>
                </span>
                <DuePill due={t.dueDate} status={t.status} provisional={t.dueProvisional} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
