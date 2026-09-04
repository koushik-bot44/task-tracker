"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Building2, User } from "lucide-react";
import { ProgressRing } from "@/components/home/progress-ring";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useOverview } from "@/lib/hooks/use-overview";
import { useMe } from "@/lib/hooks/use-users";
import { cn } from "@/lib/cn";
import type { DepartmentDTO, OverviewProject } from "@/lib/types";

/**
 * The COMPANY page (phase 48) — the founder's and directors' home. One calm
 * answer to "how is the company doing this week", then a card per department:
 * who heads it, how many projects, how much is done, what's in trouble.
 * Click a card → that department's page. One hierarchy level per screen.
 */
export function CompanyHome() {
  const { data: me } = useMe();
  const { data: departments, isLoading: loadingDepts } = useDepartments();
  const { data: overview, isLoading: loadingOverview } = useOverview();

  const projects = useMemo(() => overview?.projects ?? [], [overview]);
  const byDepartment = useMemo(() => {
    const map = new Map<string, OverviewProject[]>();
    for (const p of projects) {
      if (!p.departmentId) continue;
      const list = map.get(p.departmentId) ?? [];
      list.push(p);
      map.set(p.departmentId, list);
    }
    return map;
  }, [projects]);

  const totals = useMemo(() => {
    let done = 0;
    let total = 0;
    let overdue = 0;
    let atRisk = 0;
    for (const p of projects) {
      done += p.doneLeaves;
      total += p.totalLeaves;
      overdue += p.overdue;
      atRisk += p.atRisk;
    }
    return { done, total, overdue, atRisk };
  }, [projects]);

  const loading = loadingDepts || loadingOverview;

  // The full department list lives in the SIDEBAR (one place, the owner's
  // rule — seeing it twice read as a bug). Home surfaces only the departments
  // that actually need eyes: overdue first, then at-risk.
  const needsAttention = useMemo(() => {
    const score = (d: DepartmentDTO) => {
      const list = byDepartment.get(d.id) ?? [];
      const overdue = list.reduce((n, p) => n + p.overdue, 0);
      const atRisk = list.reduce((n, p) => n + p.atRisk, 0);
      return overdue > 0 ? 0 : atRisk > 0 ? 1 : 2;
    };
    return [...(departments ?? [])].filter((d) => score(d) < 2).sort((a, b) => score(a) - score(b));
  }, [departments, byDepartment]);

  if (loading) {
    return (
      <div className="space-y-3 px-4 py-4 sm:px-8 sm:py-6" aria-hidden>
        <div className="h-28 animate-pulse rounded-card bg-hover" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-card bg-hover" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      <header>
        <h1 className="text-page font-bold text-ink">
          {me?.name ? `Welcome, ${me.name.split(" ")[0]}` : "Company"}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Here is how the company is doing — click a department to look inside.
        </p>
      </header>

      {/* The one company-wide summary: a single ring plus what needs attention. */}
      <section className="card mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <ProgressRing done={totals.done} total={totals.total} color="var(--primary)" size={88} stroke={7} />
          <div>
            <p className="text-display font-bold leading-none text-ink">
              {totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0}%
            </p>
            <p className="mt-1 text-sm text-muted">
              {totals.done} of {totals.total} tasks completed
            </p>
          </div>
        </div>
        <div className="flex gap-6">
          <Stat label="Projects" value={projects.length} />
          <Stat label="Overdue tasks" value={totals.overdue} danger={totals.overdue > 0} />
          <Stat label="At risk" value={totals.atRisk} warn={totals.atRisk > 0} />
        </div>
      </section>

      <h2 className="mt-6 text-section font-semibold text-ink">Needs attention</h2>
      {needsAttention.length === 0 ? (
        <div className="card mt-2 p-6 text-center text-sm text-muted">
          Every department is on track. Open one from the sidebar to look inside.
        </div>
      ) : (
        <ol className="card mt-2 divide-y divide-line overflow-hidden p-0">
          {needsAttention.map((d) => (
            <DepartmentRow key={d.id} department={d} projects={byDepartment.get(d.id) ?? []} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Stat({ label, value, danger, warn }: { label: string; value: number; danger?: boolean; warn?: boolean }) {
  return (
    <div>
      <p className={cn("text-display font-bold leading-none tabular-nums", danger ? "text-danger-ink" : warn ? "text-warn-ink" : "text-ink")}>
        {value}
      </p>
      <p className="mt-1 text-micro font-medium uppercase tracking-widest text-muted">{label}</p>
    </div>
  );
}

/** One department as one readable row: dot, name + head, project count,
    progress bar carrying the trouble color, and one plain verdict. */
function DepartmentRow({ department, projects }: { department: DepartmentDTO; projects: OverviewProject[] }) {
  const done = projects.reduce((n, p) => n + p.doneLeaves, 0);
  const total = projects.reduce((n, p) => n + p.totalLeaves, 0);
  const overdue = projects.reduce((n, p) => n + p.overdue, 0);
  const atRisk = projects.reduce((n, p) => n + p.atRisk, 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const trouble = overdue > 0 ? "overdue" : atRisk > 0 ? "atrisk" : "ok";

  return (
    <li>
      <Link
        href={`/department/${department.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-150 ease-out hover:bg-hover sm:flex-nowrap"
      >
        <span className="min-w-0 flex-1 basis-48">
          <span className="block truncate text-row font-semibold text-ink">{department.name}</span>
          <span className="flex items-center gap-1 truncate text-micro text-muted">
            {department.hodName ? (
              <>
                <User className="h-3 w-3" strokeWidth={2} aria-hidden />
                Head: {department.hodName}
              </>
            ) : (
              <>
                <Building2 className="h-3 w-3" strokeWidth={2} aria-hidden />
                No head assigned
              </>
            )}
          </span>
        </span>

        <span className="w-24 shrink-0 text-right text-micro tabular-nums text-muted">
          {projects.length === 0
            ? "No projects"
            : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
        </span>

        <span className="flex w-40 shrink-0 items-center gap-2">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-chip bg-hover">
            <span
              className={cn(
                "block h-full rounded-chip",
                trouble === "overdue" ? "bg-danger" : trouble === "atrisk" ? "bg-warn" : "bg-ok",
              )}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="w-9 text-right text-sm font-semibold tabular-nums text-ink">{pct}%</span>
        </span>

        <span className="w-28 shrink-0 text-right">
          <span
            className={cn(
              "inline-flex rounded-chip px-2 py-px text-micro font-medium",
              trouble === "overdue" && "bg-danger-soft text-danger-ink",
              trouble === "atrisk" && "bg-warn-soft text-warn-ink",
              trouble === "ok" && "bg-ok-soft text-ok-ink",
            )}
          >
            {trouble === "overdue" ? `${overdue} overdue` : trouble === "atrisk" ? `${atRisk} at risk` : "On track"}
          </span>
        </span>
      </Link>
    </li>
  );
}
