"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowRight, CalendarOff, ChevronRight, Clock, PauseCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusDonut } from "@/components/charts/status-donut";
import { CollaborationInvites } from "@/components/home/collaboration-invites";
import { RoutineInvites } from "@/components/home/routine-invites";
import { FirstRunHint } from "@/components/first-run-hint";
import { ProgressRing } from "@/components/home/progress-ring";
import { TaskTitle } from "@/components/task-title";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";
import { dateState } from "@/lib/dates";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useOverview } from "@/lib/hooks/use-overview";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useAllTasks } from "@/lib/hooks/use-tasks";
import { STATUS_LABEL, type DepartmentDTO, type OverviewProject, type Status, type TaskDTO } from "@/lib/types";

type Lens =
  | { kind: "none" }
  | { kind: "status"; status: Status }
  | { kind: "schedule"; which: "overdue" | "atRisk" | "unscheduled" };

/**
 * The manager's landing page: everything, at once, and every number is a way
 * in rather than a fact to admire. Clicking a tile filters the list beneath
 * it — a count you cannot open is a count you have to go hunting for.
 */
export function PortfolioDashboard() {
  const { data, isLoading } = useOverview();
  const { data: departments } = useDepartments();
  const { data: allTasks } = useAllTasks();
  const { openTask } = usePanelParams();
  const reduce = useReducedMotion();
  const [lens, setLens] = useState<Lens>({ kind: "none" });

  /* Memoised so the derived useMemos below have a stable dependency — a fresh
     [] on every render would recompute the whole dashboard each time. */
  const projects = useMemo(() => data?.projects ?? [], [data]);
  const g = data?.global;

  // Group the tool cards by department (phase 12). The top band above stays a
  // global total; only the cards below are sectioned.
  const departmentList = useMemo(() => departments ?? [], [departments]);
  const { byDepartment, unfiled } = useMemo(() => {
    const map = new Map<string, OverviewProject[]>();
    const loose: OverviewProject[] = [];
    const known = new Set(departmentList.map((f) => f.id));
    for (const p of projects) {
      if (p.departmentId && known.has(p.departmentId)) {
        const list = map.get(p.departmentId);
        if (list) list.push(p);
        else map.set(p.departmentId, [p]);
      } else {
        loose.push(p);
      }
    }
    return { byDepartment: map, unfiled: loose };
  }, [projects, departmentList]);

  const totals = useMemo(() => {
    const done = projects.reduce((n, p) => n + p.doneLeaves, 0);
    const total = projects.reduce((n, p) => n + p.totalLeaves, 0);
    const statusCounts = {} as Record<Status, number>;
    for (const p of projects) {
      for (const [s, n] of Object.entries(p.statusCounts)) {
        statusCounts[s as Status] = (statusCounts[s as Status] ?? 0) + n;
      }
    }
    return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100), statusCounts };
  }, [projects]);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  /** The rows behind whichever tile is open. */
  const filtered = useMemo(() => {
    if (lens.kind === "none") return [];
    const rows = (allTasks ?? []).filter((t) => {
      if (lens.kind === "status") return t.status === lens.status;
      const st = dateState(t.dueDate, t.status);
      if (lens.which === "overdue") return st === "overdue";
      if (lens.which === "atRisk") return st === "at-risk";
      return (
        t.dueDate === null && t.status !== "DONE" && t.status !== "CANCELLED"
      );
    });
    return rows.slice(0, 60);
  }, [lens, allTasks]);

  if (isLoading || !data) {
    return (
      <div className="space-y-3 px-4 py-4 sm:px-8 sm:py-6" aria-hidden>
        <div className="h-40 animate-pulse rounded-card bg-hover" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-card bg-hover" />
          ))}
        </div>
      </div>
    );
  }

  const tiles = [
    {
      key: "in-progress",
      label: "In progress",
      value: g?.inFlight ?? 0,
      tone: "text-primary-ink",
      icon: Clock,
      lens: { kind: "status", status: "IN_PROGRESS" } as Lens,
    },
    {
      key: "on-hold",
      label: "On hold",
      value: g?.onHold ?? 0,
      tone: "text-warn-ink",
      icon: PauseCircle,
      lens: { kind: "status", status: "ON_HOLD" } as Lens,
    },
    {
      key: "overdue",
      label: "Overdue",
      value: g?.overdue ?? 0,
      tone: "text-danger-ink",
      icon: AlertTriangle,
      lens: { kind: "schedule", which: "overdue" } as Lens,
    },
    {
      key: "at-risk",
      label: "At risk",
      value: g?.atRisk ?? 0,
      tone: "text-warn-ink",
      icon: AlertTriangle,
      lens: { kind: "schedule", which: "atRisk" } as Lens,
    },
    {
      key: "unscheduled",
      label: "Unscheduled",
      value: g?.unscheduled ?? 0,
      tone: "text-muted",
      icon: CalendarOff,
      lens: { kind: "schedule", which: "unscheduled" } as Lens,
    },
  ];

  const sameLens = (a: Lens, b: Lens) =>
    a.kind === b.kind &&
    (a.kind !== "status" || (b.kind === "status" && a.status === b.status)) &&
    (a.kind !== "schedule" || (b.kind === "schedule" && a.which === b.which));

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      <CollaborationInvites />
      <RoutineInvites />
      <FirstRunHint id="portfolio">
        Every number here opens the work behind it.
      </FirstRunHint>

      {/* ── Top band ─────────────────────────────────────────────────────── */}
      <section className="card flex flex-wrap items-center gap-x-8 gap-y-5 p-5">
        <div className="flex items-center gap-4">
          <ProgressRing done={totals.done} total={totals.total} color="var(--primary)" size={92} />
          <div>
            <p className="font-display text-display font-bold tabular-nums text-ink">
              {totals.pct}
              <span className="text-page font-semibold text-muted">%</span>
            </p>
            <p className="text-sm text-muted">
              {totals.done} of {totals.total} smallest tasks done
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap gap-2">
          {tiles.map((t) => {
            const active = sameLens(lens, t.lens);
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setLens(active ? { kind: "none" } : t.lens)}
                aria-pressed={active}
                className={cn(
                  "press min-w-[7.5rem] flex-1 rounded-card px-3 py-2.5 text-left",
                  active ? "bg-primary-soft" : "bg-surface-2",
                )}
              >
                <span className="flex items-center gap-1.5 text-micro text-muted">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  {t.label}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block font-display text-page-lg font-bold tabular-nums",
                    t.value === 0 ? "text-muted" : t.tone,
                  )}
                >
                  {t.value}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Filtered list, only when a tile is open ──────────────────────── */}
      {lens.kind !== "none" ? (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="card mt-3 overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <h2 className="flex-1 text-sm font-semibold text-ink">
              {lens.kind === "status"
                ? STATUS_LABEL[lens.status]
                : lens.which === "overdue"
                  ? "Overdue"
                  : lens.which === "atRisk"
                    ? "At risk"
                    : "Unscheduled"}
              <span className="ml-2 text-micro font-normal tabular-nums text-muted">
                {filtered.length}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setLens({ kind: "none" })}
              className="press rounded-chip bg-hover px-2.5 py-1 text-micro text-ink"
            >
              Clear
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Nothing here — which is the good outcome.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((task) => (
                <PortfolioRow
                  key={task.id}
                  task={task}
                  toolName={projectById.get(task.projectId ?? "")?.name ?? ""}
                  toolColor={projectById.get(task.projectId ?? "")?.color ?? "var(--muted)"}
                  onOpen={() => openTask(task.id)}
                />
              ))}
            </ul>
          )}
        </motion.section>
      ) : null}

      {/* ── Tool cards, grouped by department ────────────────────────────── */}
      {projects.length === 0 ? (
        <>
          <h2 className="mb-2 mt-6 px-1 text-micro font-medium uppercase tracking-widest text-muted">
            Projects
          </h2>
          <p className="card p-8 text-center text-sm text-muted">
            No projects yet. Create one from the sidebar to start tracking work.
          </p>
        </>
      ) : (
        <div className="mt-6 space-y-6">
          {departmentList.map((department) => {
            const owned = byDepartment.get(department.id) ?? [];
            if (owned.length === 0) return null; // empty departments aren't card sections
            return (
              <DepartmentCardSection key={department.id} department={department} projects={owned} />
            );
          })}

          {/* Projects shared via a collaboration invite (phase 14) live in the
              owner's department, which the caller can't see — so they group here
              rather than under a department. */}
          {unfiled.length > 0 ? (
            <section>
              <h2 className="mb-2 px-1 text-micro font-medium uppercase tracking-widest text-muted">
                Shared with me
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {unfiled.map((p) => (
                  <ToolCard key={p.id} project={p} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * A department's card section on Home (phase 12): a header that links to the
 * department overview and carries a one-line rollup (completion %, overdue count),
 * over the grid of that department's tool cards.
 */
function DepartmentCardSection({
  department,
  projects,
}: {
  department: DepartmentDTO;
  projects: OverviewProject[];
}) {
  const done = projects.reduce((n, p) => n + p.doneLeaves, 0);
  const total = projects.reduce((n, p) => n + p.totalLeaves, 0);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const overdue = projects.reduce((n, p) => n + p.overdue, 0);

  return (
    <section>
      <Link
        href={`/department/${department.id}`}
        className="group mb-2 flex items-center gap-2 rounded-chip px-1 py-1 hover:bg-hover"
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center text-sm" aria-hidden>
          {department.icon ? (
            department.icon
          ) : (
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: department.color }} />
          )}
        </span>
        <h2 className="truncate text-sm font-semibold text-ink">{department.name}</h2>
        <span className="text-micro tabular-nums text-muted">
          {pct}% done
          {overdue > 0 ? (
            <span className="text-danger-ink"> · {overdue} overdue</span>
          ) : null}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
          strokeWidth={2}
          aria-hidden
        />
      </Link>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <ToolCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}

function ToolCard({ project: p }: { project: OverviewProject }) {
  return (
    <article className="card lift overflow-hidden">
      <Link href={`/t/${p.slug}/overview`} className="block p-4">
        <header className="flex items-start gap-2">
          <span
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: p.color }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-section font-semibold text-ink">
              {p.name}
            </h3>
            {/* How big is this tool? The donut shows the shape of the work and
                the ring shows the percentage, but neither says whether that 50%
                is three tasks or three hundred. The count is the denominator
                everything else assumes. */}
            <p className="truncate text-micro text-muted">
              {taskTotal(p)} task{taskTotal(p) === 1 ? "" : "s"}
              {" · "}
              {p.leadName ?? <span className="italic">No lead assigned</span>}
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
        </header>

        <StatusDonut counts={p.statusCounts} className="mt-3" />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.overdue > 0 ? <Badge tone="danger" label={`${p.overdue} overdue`} /> : null}
          {p.atRisk > 0 ? <Badge tone="warn" label={`${p.atRisk} at risk`} /> : null}
          {p.unscheduled > 0 ? <Badge tone="muted" label={`${p.unscheduled} undated`} /> : null}
          {p.overdue === 0 && p.atRisk === 0 && p.unscheduled === 0 ? (
            <Badge tone="ok" label="On schedule" />
          ) : null}
        </div>
      </Link>
    </article>
  );
}

/** Every task in the tool, whatever its status — the honest denominator. */
function taskTotal(p: { statusCounts: Record<Status, number> }): number {
  return Object.values(p.statusCounts).reduce((n, c) => n + c, 0);
}

function Badge({
  tone,
  label,
}: {
  tone: "danger" | "warn" | "ok" | "muted";
  label: string;
}) {
  return (
    <span
      className={cn(
        "flex h-6 items-center rounded-chip px-2 text-micro font-medium",
        tone === "danger" && "bg-danger-soft text-danger-ink",
        tone === "warn" && "bg-warn-soft text-warn-ink",
        tone === "ok" && "bg-ok-soft text-ok-ink",
        tone === "muted" && "bg-hover text-muted",
      )}
    >
      {label}
    </span>
  );
}

function PortfolioRow({
  task,
  toolName,
  toolColor,
  onOpen,
}: {
  task: TaskDTO;
  toolName: string;
  toolColor: string;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-hover"
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: toolColor }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">
            <TaskTitle title={task.title} />
          </span>
          <span className="block truncate text-micro text-muted">{toolName}</span>
        </span>
        <Tooltip content={task.assigneeName ?? "Nobody is assigned"}>
          <span className="shrink-0 text-micro text-muted">
            {task.assigneeName ?? "—"}
          </span>
        </Tooltip>
      </button>
    </li>
  );
}
