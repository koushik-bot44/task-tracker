"use client";

import { ArrowRight, Pencil, Plus, User } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DepartmentManageModal } from "@/components/department-manage-modal";
import { DeadlineChip, PRIORITY_ORDER, PriorityPill } from "@/components/priority-pill";
import { ToolCreateModal } from "@/components/tool-create-modal";
import { cn } from "@/lib/cn";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useOverview } from "@/lib/hooks/use-overview";
import { useMe } from "@/lib/hooks/use-users";
import { isManagerRole } from "@/lib/roles";
import type { OverviewProject, Status } from "@/lib/types";

/**
 * A department's dashboard (phase 12): the same rollup Home shows, scoped to one
 * department's tools. The aggregation is the overview endpoint with a department scope —
 * no second aggregator. Only the tools the caller can see are counted.
 */
export function DepartmentOverview({ departmentId }: { departmentId: string }) {
  const { data, isLoading } = useOverview(departmentId);
  const { data: departments } = useDepartments();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);

  const department = (departments ?? []).find((f) => f.id === departmentId) ?? null;
  // Department metadata is executive-owned since phase 48 (the HOD edits only
  // the description, via the department page rebuild).
  const isManager = me?.role === "FOUNDER" || me?.role === "DIRECTOR";
  // Who may start a project HERE: executives and managers anywhere; an HOD only
  // in the department they head — mirrors the server's create rule.
  const canCreateHere =
    isManagerRole(me?.role) && (me?.role !== "HOD" || department?.hodId === me?.id);
  const projects = useMemo(() => {
    const list = [...(data?.projects ?? [])];
    // The owner's rule: the important things rise. Priority, then the nearer
    // deadline, then the name — the same order everywhere.
    list.sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        (a.deadline ? new Date(a.deadline).getTime() : Infinity) -
          (b.deadline ? new Date(b.deadline).getTime() : Infinity) ||
        a.name.localeCompare(b.name),
    );
    return list;
  }, [data]);
  const g = data?.global;

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


  if (isLoading || !data) {
    return (
      <div className="space-y-3 px-4 py-4 sm:px-8 sm:py-6" aria-hidden>
        <div className="h-10 w-56 animate-pulse rounded-card bg-hover" />
        <div className="h-44 animate-pulse rounded-card bg-hover" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-card bg-hover" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      {/* ── Department header — typographic only, per the monochrome system
          (no icon circle, no color dot; the NAME is the identity). */}
      <div className="mb-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-page-lg font-bold text-ink">
            {department?.name ?? "Department"}
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 text-micro text-muted">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" strokeWidth={2} aria-hidden />
              {department?.hodName ? `Head: ${department.hodName}` : "No head assigned"}
            </span>
            <span>
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        {/* The owner's spec: starting a project is the PRIMARY action here,
            at the top — before the numbers. */}
        {canCreateHere && department ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="press flex h-9 shrink-0 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            New project
          </button>
        ) : null}
        {isManager && department ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="press flex h-9 shrink-0 items-center gap-1.5 rounded-card border border-line px-3 text-sm text-ink"
          >
            <Pencil className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-hidden />
            Edit
          </button>
        ) : null}
      </div>

      {department?.description ? (
        <p className="mb-4 max-w-2xl text-sm text-muted">{department.description}</p>
      ) : null}

      {/* ── The project LIST, most urgent first — and NOTHING else. The
          owner's call: no rings, no tiles, no charts on this page. One quiet
          summary sentence, then one row per project, priority-ranked. A row
          expands on hover to reveal what the project is for. */}
      <p className="mb-2 px-1 text-sm text-muted">
        {totals.done} of {totals.total} tasks completed
        {(g?.overdue ?? 0) > 0 ? (
          <span className="text-danger-ink"> · {g?.overdue} overdue</span>
        ) : null}
      </p>
      <h2 className="mb-2 mt-4 px-1 text-micro font-medium uppercase tracking-widest text-muted">
        Projects, most urgent first
      </h2>

      {projects.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm font-medium text-ink">No projects here yet</p>
          <p className="mt-1 text-sm text-muted">
            A project is a piece of work with its own tasks, owner and deadline.
            {canCreateHere ? " Start one with the button above." : ""}
          </p>
        </div>
      ) : (
        <ol className="card divide-y divide-line overflow-hidden p-0">
          {projects.map((p, i) => (
            <ProjectRow key={p.id} project={p} rank={i + 1} />
          ))}
        </ol>
      )}

      {department ? (
        <DepartmentManageModal open={editing} department={department} onClose={() => setEditing(false)} />
      ) : null}
      <ToolCreateModal open={creating} departmentId={departmentId} onClose={() => setCreating(false)} />
    </div>
  );
}

/** One project as one readable row: rank, name + who runs it, priority,
    deadline, a thin progress bar with its %, and the single worst signal.
    Moving the cursor onto the row EXPANDS it to show the about text (and
    focusing it with the keyboard does the same). */
function ProjectRow({ project: p, rank }: { project: OverviewProject; rank: number }) {
  const pct = p.totalLeaves > 0 ? Math.round((p.doneLeaves / p.totalLeaves) * 100) : 0;
  return (
    <li className="group">
      <Link
        href={`/t/${p.slug}/overview`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-150 ease-out hover:bg-hover sm:flex-nowrap"
      >
        <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums text-muted" aria-hidden>
          {rank}
        </span>
        <span className="min-w-0 flex-1 basis-48">
          <span className="block truncate text-row font-semibold text-ink">{p.name}</span>
          <span className="block truncate text-micro text-muted">
            {taskTotal(p)} task{taskTotal(p) === 1 ? "" : "s"}
            {p.leadName ? ` · ${p.leadName}` : " · no lead yet"}
          </span>
        </span>

        <PriorityPill priority={p.priority} />
        <DeadlineChip deadline={p.deadline} />

        <span className="flex w-36 shrink-0 items-center gap-2">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-chip bg-hover">
            <span
              className={cn(
                "block h-full rounded-chip",
                p.overdue > 0 ? "bg-danger" : p.atRisk > 0 ? "bg-warn" : "bg-ok",
              )}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="w-9 text-right text-sm font-semibold tabular-nums text-ink">{pct}%</span>
        </span>

        <span className="w-24 shrink-0 text-right">
          {p.overdue > 0 ? (
            <Badge tone="danger" label={`${p.overdue} overdue`} />
          ) : p.atRisk > 0 ? (
            <Badge tone="warn" label={`${p.atRisk} at risk`} />
          ) : (
            <Badge tone="ok" label="On track" />
          )}
        </span>

        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted sm:block" strokeWidth={1.75} aria-hidden />
      </Link>

      {/* The hover-expanded ABOUT. Pure CSS (max-height + opacity on
          group-hover / group-focus-within) so it needs no state, works with
          the keyboard, and collapses the moment the cursor leaves. */}
      <div className="grid max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-out group-focus-within:max-h-32 group-focus-within:opacity-100 group-hover:max-h-32 group-hover:opacity-100">
        <p className="px-4 pb-3 pl-[52px] text-sm leading-relaxed text-muted">
          {p.description.trim()
            ? p.description
            : "No description yet — the project owner can add one from About & requirements."}
        </p>
      </div>
    </li>
  );
}

function taskTotal(p: { statusCounts: Record<Status, number> }): number {
  return Object.values(p.statusCounts).reduce((n, c) => n + c, 0);
}

function Badge({ tone, label }: { tone: "danger" | "warn" | "ok" | "muted"; label: string }) {
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
