"use client";

import { Check, ChevronRight, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusDonut } from "@/components/charts/status-donut";
import { WeeklyBars, WorkloadBars } from "@/components/charts/bar-chart";
import { FirstRunHint } from "@/components/first-run-hint";
import { TaskTitle } from "@/components/task-title";
import { useToast } from "@/components/toast";
import { ToolAboutPanel } from "@/components/tool-about-panel";
import { AssigneeChip, DuePill } from "@/components/tree/task-meta";
import { cn } from "@/lib/cn";
import { dateState, formatDMY } from "@/lib/dates";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjectBySlug } from "@/lib/hooks/use-projects";
import { useTasks } from "@/lib/hooks/use-tasks";
import { STATUS_STYLE } from "@/lib/status";
import { buildTree, leafProgress, leafProgressByTask, type TreeNode } from "@/lib/tree";
import { isoDate, startOfIsoWeekLocal } from "@/lib/weeks";
import { STATUSES, STATUS_LABEL, type Status, type TaskDTO } from "@/lib/types";

const WEEKS = 8;

/**
 * The manager's view of one tool.
 *
 * Root tasks only, deliberately. The owner asked for a simple view: a manager
 * wants to know how each piece of work is doing, not to read the whole
 * outline. Subtasks are a count and an expander, collapsed by default.
 *
 * Charts are hand-rolled SVG (standing constraint) and every one of them is a
 * filter — clicking a donut segment or a person's bar narrows the list, and
 * the two combine.
 */
export function ToolOverview({ slug }: { slug: string }) {
  const { project, isLoading: loadingProject } = useProjectBySlug(slug);
  const { data, isLoading } = useTasks(project?.id ?? null);
  const tasks = useMemo(() => data ?? [], [data]);
  const { openTask } = usePanelParams();
  const { show: toast } = useToast();

  const [status, setStatus] = useState<Status | null>(null);
  const [assignee, setAssignee] = useState<string | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [aboutOpen, setAboutOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  /** Root rows with their leaf rollup — the same numbers the tree shows. */
  const roots = useMemo(() => {
    const nodes = buildTree(tasks);
    return nodes.map((n) => {
      const p = leafProgress(n);
      /* The whole subtree, not just the first level. The count and the rows it
         expands to are the SAME list — they used to be two separate walks, so a
         row advertised "6 subtasks" and then opened to three, with the
         grandchildren reachable only from the tree. */
      const descendants = flattenDescendants(n);
      return {
        task: n.task,
        done: p.done,
        total: p.total,
        pct: p.total === 0 ? (n.task.status === "DONE" ? 100 : 0) : Math.round((p.done / p.total) * 100),
        subtasks: descendants.length,
        children: descendants,
      };
    });
  }, [tasks]);

  /** Each task's leaf rollup, so an expanded sub-parent can show its own %. */
  const rollup = useMemo(() => leafProgressByTask(tasks), [tasks]);

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
    for (const t of tasks) counts[t.status]++;
    return counts;
  }, [tasks]);

  /** Completions per ISO week, computed here rather than widening the payload. */
  const weekly = useMemo(() => {
    const buckets = new Map<string, number>();
    const start = startOfIsoWeekLocal(new Date());
    const keys: string[] = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(d.getDate() - i * 7);
      const k = isoDate(d);
      keys.push(k);
      buckets.set(k, 0);
    }
    for (const t of tasks) {
      if (t.status !== "DONE" || !t.completedAt) continue;
      const k = isoDate(startOfIsoWeekLocal(new Date(t.completedAt)));
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return keys.map((k) => {
      const d = new Date(k);
      return {
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        value: buckets.get(k) ?? 0,
        title: `Week of ${formatDMY(k)} — ${buckets.get(k) ?? 0} completed`,
      };
    });
  }, [tasks]);

  const perAssignee = useMemo(() => {
    const map = new Map<string | null, { name: string; open: number; done: number }>();
    for (const t of tasks) {
      if (t.status === "CANCELLED") continue;
      const key = t.assigneeId;
      const e = map.get(key) ?? { name: t.assigneeName ?? "Unassigned", open: 0, done: 0 };
      if (t.status === "DONE") e.done++;
      else e.open++;
      map.set(key, e);
    }
    return [...map.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }, [tasks]);

  const filteredRoots = useMemo(
    () =>
      roots.filter((r) => {
        if (status && r.task.status !== status) return false;
        if (assignee !== undefined && r.task.assigneeId !== assignee) return false;
        return true;
      }),
    [roots, status, assignee],
  );

  const overall = useMemo(() => {
    const done = roots.reduce((n, r) => n + r.done, 0);
    const total = roots.reduce((n, r) => n + r.total, 0);
    return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
  }, [roots]);

  const copyReport = async () => {
    const today = formatDMY(new Date().toISOString());
    const lines = [
      `# ${project?.name ?? slug} — status ${today}`,
      "",
      `Overall: ${overall.pct}% (${overall.done}/${overall.total} smallest tasks done)`,
      `In progress ${statusCounts.IN_PROGRESS} · on hold ${statusCounts.ON_HOLD} · done ${statusCounts.DONE} · overdue ${
        tasks.filter((t) => dateState(t.dueDate, t.status) === "overdue").length
      } · at risk ${tasks.filter((t) => dateState(t.dueDate, t.status) === "at-risk").length}`,
      "",
    ];
    for (const r of roots) {
      const due = r.task.dueDate
        ? formatDMY(r.task.dueDate)
        : "no date";
      const late = dateState(r.task.dueDate, r.task.status) === "overdue" ? ", OVERDUE" : "";
      lines.push(
        `- ${r.task.title || "Untitled"} — ${r.pct}% (${STATUS_LABEL[r.task.status]}, ${
          r.task.assigneeName ?? "Unassigned"
        }, due ${due}${late})`,
      );
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast({ message: "Status report copied" });
    } catch {
      toast({ message: "Clipboard blocked by the browser.", tone: "danger" });
    }
  };

  if (!project) {
    return loadingProject ? null : (
      <p className="px-5 py-16 text-center text-sm text-muted">No project with that address.</p>
    );
  }

  const filtersOn = status !== null || assignee !== undefined;

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      <FirstRunHint id="tool-overview">
        Charts filter the list — click a segment or a person.
      </FirstRunHint>

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <header className="card p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ background: project.color }}
            aria-hidden
          />
          {/* A floor on the name, same lesson as the tool header: it was the
              only shrinkable thing on the row, so at 390 the tool was called
              "SS- Shot Sa…" while two buttons kept their full width. The
              buttons wrap instead. */}
          {/* Same lesson as the tool header: the name takes its own line on a
              phone rather than competing with two buttons for one. */}
          <h1 className="w-full min-w-0 truncate font-display text-page font-semibold text-ink sm:w-auto sm:min-w-[12rem] sm:flex-1">
            {project.name}
          </h1>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="press flex h-8 items-center rounded-chip bg-hover px-2.5 text-micro text-ink"
          >
            About &amp; requirements
          </button>
          <button
            type="button"
            onClick={copyReport}
            className="press flex h-8 items-center gap-1.5 rounded-chip bg-primary px-2.5 text-micro font-medium text-on-primary"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            )}
            Copy status report
          </button>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted">
          <span>
            Lead:{" "}
            {project.leadName ?? <span className="italic">nobody assigned</span>}
          </span>
          <span aria-hidden>·</span>
          <span>
            Created{" "}
            {formatDMY(project.createdAt)}
          </span>
        </p>

        {project.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
            {project.description}
          </p>
        ) : (
          <p className="mt-2 text-sm italic text-muted">
            No description yet — a manager can add one from About &amp; requirements.
          </p>
        )}
      </header>

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="mb-3 text-micro font-medium uppercase tracking-widest text-muted">
            By status
          </h2>
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-card bg-hover" aria-hidden />
          ) : (
            <StatusDonut counts={statusCounts} selected={status} onSelect={setStatus} />
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-micro font-medium uppercase tracking-widest text-muted">
            Completed per week
          </h2>
          <WeeklyBars data={weekly} />
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-micro font-medium uppercase tracking-widest text-muted">
            Workload
          </h2>
          <WorkloadBars
            data={perAssignee}
            selected={assignee}
            onSelect={(id) => setAssignee(assignee === id ? undefined : id)}
          />
        </section>
      </div>

      {/* ── Root tasks ───────────────────────────────────────────────────── */}
      <section className="card mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">
            Tasks
            <span className="ml-2 text-micro font-normal tabular-nums text-muted">
              {filteredRoots.length}
              {filtersOn ? ` of ${roots.length}` : ""}
            </span>
          </h2>

          {filtersOn ? (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {status ? (
                <span className={cn("flex h-6 items-center rounded-chip px-2 text-micro", STATUS_STYLE[status].pill)}>
                  {STATUS_LABEL[status]}
                </span>
              ) : null}
              {assignee !== undefined ? (
                <span className="flex h-6 items-center rounded-chip bg-hover px-2 text-micro text-ink">
                  {perAssignee.find((a) => a.userId === assignee)?.name ?? "Unassigned"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setStatus(null);
                  setAssignee(undefined);
                }}
                className="press flex h-6 items-center rounded-chip bg-hover px-2 text-micro text-ink"
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-card bg-hover" />
            ))}
          </div>
        ) : filteredRoots.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {roots.length === 0
              ? "No tasks in this project yet."
              : "Nothing matches those filters."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filteredRoots.map((r) => (
              <li key={r.task.id}>
                {/* Fixed height. Rows with a subtask line were taller than
                    rows without one, so the list stepped up and down as you
                    read it — the same defect fixed on Review and Focus in
                    session 1. The row sets the height; its contents do not. */}
                <div className="flex min-h-[3.5rem] flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2 sm:px-4">
                  {r.subtasks > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.task.id)) next.delete(r.task.id);
                          else next.add(r.task.id);
                          return next;
                        })
                      }
                      aria-expanded={expanded.has(r.task.id)}
                      aria-label={`${expanded.has(r.task.id) ? "Hide" : "Show"} subtasks`}
                      className="press grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:text-ink"
                    >
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-150 ease-out",
                          expanded.has(r.task.id) && "rotate-90",
                        )}
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <span className="h-6 w-6 shrink-0" aria-hidden />
                  )}

                  <button
                    type="button"
                    onClick={() => openTask(r.task.id)}
                    className="min-w-0 flex-[1_1_12rem] text-left"
                  >
                    <span className="block truncate text-sm text-ink">
                      <TaskTitle title={r.task.title} />
                    </span>
                    {r.subtasks > 0 ? (
                      <span className="block text-micro text-muted">
                        {r.subtasks} subtask{r.subtasks === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </button>

                  <PercentBar pct={r.pct} done={r.done} total={r.total} />

                  <span
                    className={cn(
                      "flex h-6 shrink-0 items-center rounded-chip px-2 text-micro font-medium",
                      STATUS_STYLE[r.task.status].pill,
                    )}
                  >
                    {STATUS_LABEL[r.task.status]}
                  </span>

                  <DuePill
                    due={r.task.dueDate}
                    status={r.task.status}
                    provisional={r.task.dueProvisional}
                  />
                  <AssigneeChip name={r.task.assigneeName} compact />
                </div>

                {expanded.has(r.task.id) ? (
                  <ul className="border-t border-line bg-surface-2">
                    {r.children.map(({ task: c, depth }) => {
                      const cp = rollup.get(c.id);
                      // A "parent" subtask has its own subtasks — it reads as a group
                      // (bold title + a progress meter); a leaf reads as a single item
                      // (plain title + a tick once done).
                      const isParent = !!(cp && cp.hasChildren);
                      const pct = isParent ? Math.round((cp!.done / cp!.total) * 100) : 0;
                      return (
                        <li
                          key={c.id}
                          /* Pack left so the tick/%/dash sits right AFTER the name
                             (not pinned to the far edge — that was hard to scan). */
                          className="flex items-center gap-x-2 py-2 pr-4"
                          /* Depth is data, so the indent is inline: Tailwind
                             cannot build a class from a runtime number. 3rem is
                             the old pl-12 baseline. */
                          style={{ paddingLeft: `${3 + depth * 1.125}rem` }}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              STATUS_STYLE[c.status].dot,
                            )}
                            aria-hidden
                          />
                          <span className={cn("min-w-0 truncate text-micro text-ink", isParent && "font-semibold")}>
                            <TaskTitle title={c.title} />
                          </span>
                          {/* A subtask WITH subtasks shows a small progress meter (its
                              rollup %); a leaf shows a tick once done, or a dash while not. */}
                          {isParent ? (
                            <span className="flex shrink-0 items-center gap-1.5" title={`${cp!.done} of ${cp!.total} subtasks done`}>
                              <span className="hidden h-1 w-12 overflow-hidden rounded-chip bg-hover sm:block">
                                <span
                                  className={cn("block h-full", pct === 100 ? "bg-ok-ink" : "bg-primary")}
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                              <span className={cn("w-8 text-right text-micro font-semibold tabular-nums", pct === 100 ? "text-ok-ink" : "text-muted")}>
                                {pct}%
                              </span>
                            </span>
                          ) : c.status === "DONE" ? (
                            <LeafTick />
                          ) : (
                            <span className="shrink-0 text-micro text-muted" title="Not done">—</span>
                          )}
                          {c.assigneeName ? (
                            <span className="shrink-0 text-micro text-muted">{c.assigneeName}</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ToolAboutPanel project={project} open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

/** A leaf subtask carries no percentage — just a small tick once it's done. */
function LeafTick() {
  return <Check className="h-3.5 w-3.5 shrink-0 text-ok-ink" strokeWidth={2.75} aria-label="Completed" />;
}

function PercentBar({ pct, done, total }: { pct: number; done: number; total: number }) {
  return (
    <span
      className="flex shrink-0 items-center gap-2"
      title={`${done} of ${total} smallest tasks done`}
    >
      <span className="hidden h-1.5 w-20 overflow-hidden rounded-chip bg-hover sm:block">
        <span
          className={cn("block h-full", pct === 100 ? "bg-ok-ink" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-9 text-right text-micro font-semibold tabular-nums text-muted">
        {pct}%
      </span>
    </span>
  );
}

/**
 * Every descendant in outline order, each carrying how deep it sits so the row
 * can indent. Depth 0 is a direct child.
 *
 * One walk feeds both the "N subtasks" label and the rows the expander opens,
 * so the two can never disagree again.
 */
function flattenDescendants(
  node: TreeNode,
  depth = 0,
): Array<{ task: TaskDTO; depth: number }> {
  const out: Array<{ task: TaskDTO; depth: number }> = [];
  for (const child of node.children) {
    out.push({ task: child.task, depth });
    out.push(...flattenDescendants(child, depth + 1));
  }
  return out;
}
