"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskTitle } from "@/components/task-title";
import { useToast } from "@/components/toast";
import { formatDMY } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useAllTasks } from "@/lib/hooks/use-tasks";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjects } from "@/lib/hooks/use-projects";
import { ancestorPath, ancestorTrail, isoDate, startOfIsoWeekLocal } from "@/lib/weeks";
import type { TaskDTO } from "@/lib/types";

export function ChangelogView() {
  const { data: tasks, isLoading } = useAllTasks();
  const { data: projects } = useProjects();
  const { openTask } = usePanelParams();
  const { show: toast } = useToast();
  const [filter, setFilter] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const byId = useMemo(
    () => new Map((tasks ?? []).map((t) => [t.id, t])),
    [tasks],
  );
  const projectById = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p])),
    [projects],
  );

  /** Done tasks bucketed by the Monday of the week they were completed in. */
  const weeks = useMemo(() => {
    const done = (tasks ?? []).filter(
      (t) =>
        t.status === "DONE" &&
        t.completedAt &&
        (filter === null || t.projectId === filter),
    );

    const buckets = new Map<string, TaskDTO[]>();
    for (const task of done) {
      const key = isoDate(startOfIsoWeekLocal(new Date(task.completedAt as string)));
      const list = buckets.get(key);
      if (list) list.push(task);
      else buckets.set(key, [task]);
    }

    return [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([week, items]) => ({
        week,
        items: items.sort(
          (a, b) =>
            Date.parse(b.completedAt as string) - Date.parse(a.completedAt as string),
        ),
      }));
  }, [tasks, filter]);

  const markdown = useMemo(
    () =>
      weeks
        .map(({ week, items }) => {
          const lines = items.map((task) => {
            const tool = projectById.get(task.projectId ?? "")?.name ?? "Unknown";
            return `- [${tool}] ${ancestorPath(task, byId)}`;
          });
          return `## Week of ${formatDMY(week)}\n${lines.join("\n")}`;
        })
        .join("\n\n"),
    [weeks, projectById, byId],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast({ message: "Copied" });
    } catch {
      toast({ message: "Clipboard blocked by the browser.", tone: "danger" });
    }
  };

  return (
    <div className="max-w-3xl px-4 py-4 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* The app bar already says Changelog. */}
        <p className="flex-1 text-sm text-muted">
          Everything finished, newest week first.
        </p>
        <button
          type="button"
          onClick={copy}
          disabled={weeks.length === 0}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover disabled:opacity-40"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-primary-ink" strokeWidth={2.5} aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          )}
          Copy as markdown
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip active={filter === null} onClick={() => setFilter(null)} label="All projects" />
        {(projects ?? []).map((project) => (
          <Chip
            key={project.id}
            active={filter === project.id}
            onClick={() => setFilter(project.id)}
            label={project.name}
            color={project.color}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-hover" />
          ))}
        </div>
      ) : weeks.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">
          Nothing shipped yet. Complete a task and it lands here.
        </p>
      ) : (
        <div className="mt-6 space-y-7">
          {weeks.map(({ week, items }) => (
            <section key={week}>
              <h2 className="sticky top-14 z-sticky -mx-1 bg-scrim px-1 py-1.5 font-display text-base font-semibold text-ink backdrop-blur">
                Week of {formatDMY(week)}
                <span className="ml-2 text-micro font-normal tabular-nums text-muted">
                  {items.length}
                </span>
              </h2>
              <ul className="mt-1 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {items.map((task) => {
                  const tool = projectById.get(task.projectId ?? "");
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        /* Fixed height: rows with an ancestor path were taller
                           than rows without, so the list stepped as you read
                           down it — the same defect fixed on Review, Focus and
                           the Tool Overview. */
                        className="flex min-h-[3.25rem] w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-hover"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: tool?.color ?? "var(--muted)" }}
                          aria-hidden
                        />
                        {/* Path above, title below. Truncating one string cut
                            the task name off the end and left rows reading
                            identically; the title must never be the part
                            that disappears. */}
                        <span className="min-w-0 flex-1">
                          {(() => {
                            const trail = ancestorTrail(task, byId);
                            return trail ? (
                              <span className="block truncate text-micro text-muted">
                                {trail}
                              </span>
                            ) : null;
                          })()}
                          <span className="block truncate text-sm text-ink">
                            <TaskTitle title={task.title} />
                          </span>
                          {/* Narrow screens have no room for the right-hand
                              columns, and a changelog that cannot say who
                              shipped the work is not a changelog. They drop to
                              a second line here rather than disappearing. */}
                          {task.completedByName || tool ? (
                            <span className="mt-0.5 flex items-center gap-1.5 truncate text-micro text-muted sm:hidden">
                              {task.completedByName ? <span>{task.completedByName}</span> : null}
                              {task.completedByName && tool ? <span aria-hidden>·</span> : null}
                              {tool ? <span>{tool.name}</span> : null}
                            </span>
                          ) : null}
                        </span>
                        {task.completedByName ? (
                          <span className="hidden shrink-0 text-micro text-muted sm:inline">
                            {task.completedByName}
                          </span>
                        ) : null}
                        {tool ? (
                          <span className="hidden shrink-0 text-micro text-muted sm:inline">
                            {tool.name}
                          </span>
                        ) : null}
                        {task.deliverableUrl ? (
                          <ExternalLink
                            className="h-3.5 w-3.5 shrink-0 text-primary-ink"
                            strokeWidth={1.75}
                            aria-label="Has a deliverable link"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-micro transition-colors duration-150 ease-out",
        active
          ? "bg-primary-soft font-medium text-primary-ink"
          : "bg-hover text-muted hover:text-ink",
      )}
    >
      {color ? (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      ) : null}
      {label}
    </button>
  );
}
