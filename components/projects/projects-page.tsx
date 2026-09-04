"use client";

import { Plus, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DepartmentList, type DepartmentSummary } from "@/components/projects/department-list";
import { DepartmentSection } from "@/components/projects/department-section";
import { DepartmentView, byRankThenOrder } from "@/components/projects/department-view";
import { DepartmentSheet } from "@/components/sheets/department-sheet";
import { NewProjectSheet } from "@/components/sheets/new-project-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/sheet";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMe } from "@/lib/hooks/use-users";
import { isExecutiveRole, isHodRole } from "@/lib/roles";
import type { DepartmentDTO, ProjectDTO } from "@/lib/types";

/**
 * Projects, in two levels. First the departments — one row each, with how
 * many projects live there and how many are behind. Tap one to see its
 * projects (All / Mine / Behind, the cards, "+ New project" there). Typing in
 * "Find a project" searches every project at once, grouped by department.
 * The open department lives in the URL (?d=…) so Back returns to the list.
 */
export function ProjectsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("d");

  const { data: me } = useMe();
  const projectsQuery = useProjects();
  const departmentsQuery = useDepartments();

  const [q, setQ] = useState("");
  /** Which department "+ New project" was tapped in; null id = pick one in the sheet. */
  const [startIn, setStartIn] = useState<{ id: string | null; name?: string } | null>(null);
  const [editing, setEditing] = useState<DepartmentDTO | null>(null);
  const [departmentSheetOpen, setDepartmentSheetOpen] = useState(false);

  const projects = projectsQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];

  const executive = isExecutiveRole(me?.role);
  const hod = isHodRole(me?.role);
  const canStartAnywhere = executive || me?.role === "MANAGER";
  const canStartIn = (d: DepartmentDTO) => canStartAnywhere || (hod && d.hodId === me?.id);
  const canEditDepartment = (d: DepartmentDTO) => executive || (hod && d.hodId === me?.id);
  const canStartSomewhere = departments.some(canStartIn);

  const isMine = (p: ProjectDTO) =>
    Boolean(me) && (p.people.some((x) => x.id === me?.id) || p.leadId === me?.id || p.ownerId === me?.id);

  // Every visible project filed under its department; the rest are "not in a department yet".
  const known = new Set(departments.map((d) => d.id));
  const byDepartment = new Map<string, ProjectDTO[]>();
  const unfiled: ProjectDTO[] = [];
  for (const p of projects) {
    if (p.departmentId && known.has(p.departmentId)) {
      const list = byDepartment.get(p.departmentId) ?? [];
      list.push(p);
      byDepartment.set(p.departmentId, list);
    } else {
      unfiled.push(p);
    }
  }
  for (const list of byDepartment.values()) list.sort(byRankThenOrder);
  unfiled.sort(byRankThenOrder);

  // Departments with projects first (in their order), then the empty ones.
  const summaries: DepartmentSummary[] = departments
    .map((d) => {
      const list = byDepartment.get(d.id) ?? [];
      return { department: d, count: list.length, behind: list.filter((p) => p.behind && p.status !== "DONE").length };
    })
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0));

  const needle = q.trim().toLowerCase();
  const found = needle.length === 0 ? [] : projects.filter((p) => p.name.toLowerCase().includes(needle)).sort(byRankThenOrder);
  const foundByDepartment = new Map<string, ProjectDTO[]>();
  const foundUnfiled: ProjectDTO[] = [];
  for (const p of found) {
    if (p.departmentId && known.has(p.departmentId)) {
      const list = foundByDepartment.get(p.departmentId) ?? [];
      list.push(p);
      foundByDepartment.set(p.departmentId, list);
    } else {
      foundUnfiled.push(p);
    }
  }

  const openDepartment = (d: DepartmentDTO) => router.push(`/projects?d=${encodeURIComponent(d.id)}`, { scroll: false });
  const closeDepartment = () => router.push("/projects", { scroll: false });
  const openNewDepartment = () => {
    setEditing(null);
    setDepartmentSheetOpen(true);
  };

  const sheets = (
    <>
      <NewProjectSheet
        open={startIn !== null}
        onClose={() => setStartIn(null)}
        departmentId={startIn?.id ?? null}
        departmentName={startIn?.name}
      />
      <DepartmentSheet open={departmentSheetOpen} onClose={() => setDepartmentSheetOpen(false)} department={editing} />
    </>
  );

  if (projectsQuery.isLoading || departmentsQuery.isLoading) {
    return (
      <Shell>
        <div className="space-y-3">
          <Skeleton rows={1} className="[&>div]:h-11" />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Shell>
    );
  }

  if (projectsQuery.isError || departmentsQuery.isError) {
    const err = (projectsQuery.error ?? departmentsQuery.error) as Error | null;
    return (
      <Shell>
        <ErrorState
          message={err?.message}
          onRetry={() => {
            void projectsQuery.refetch();
            void departmentsQuery.refetch();
          }}
        />
      </Shell>
    );
  }

  if (projects.length === 0 && departments.length === 0) {
    return (
      <Shell>
        <EmptyState
          title="No projects yet."
          body={canStartSomewhere ? "Start one and it shows up here." : "When you're put on one, it shows up here."}
          action={
            canStartSomewhere ? (
              <Button variant="primary" onClick={() => setStartIn({ id: null })}>
                New project
              </Button>
            ) : executive ? (
              <Button variant="primary" onClick={openNewDepartment}>
                New department
              </Button>
            ) : undefined
          }
        />
        {sheets}
      </Shell>
    );
  }

  // Level 2: one department, its projects.
  const open = openId ? departments.find((d) => d.id === openId) ?? null : null;
  if (open) {
    return (
      <Shell>
        <DepartmentView
          department={open}
          projects={byDepartment.get(open.id) ?? []}
          isMine={isMine}
          canEdit={canEditDepartment(open)}
          canStart={canStartIn(open)}
          onBack={closeDepartment}
          onEdit={() => {
            setEditing(open);
            setDepartmentSheetOpen(true);
          }}
          onStart={() => setStartIn({ id: open.id, name: open.name })}
        />
        {sheets}
      </Shell>
    );
  }

  // Level 1: the departments (or, while searching, the matching projects).
  return (
    <Shell>
      <div className="space-y-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a project"
            aria-label="Find a project"
            autoComplete="off"
            className={cn(inputClass, "pl-10")}
          />
        </div>

        {needle.length > 0 ? (
          found.length === 0 ? (
            <EmptyState title="No project called that." body="Check the spelling, or clear the search." />
          ) : (
            <div className="space-y-8">
              {departments.map((d) => {
                const list = foundByDepartment.get(d.id) ?? [];
                if (list.length === 0) return null;
                return <DepartmentSection key={d.id} title={d.name} projects={list} />;
              })}
              {foundUnfiled.length > 0 ? <DepartmentSection title="Not in a department yet" projects={foundUnfiled} /> : null}
            </div>
          )
        ) : (
          <>
            <section aria-labelledby="departments-heading" className="space-y-2">
              <div className="flex min-h-11 items-center gap-2">
                <h2 id="departments-heading" className="min-w-0 flex-1 text-micro font-semibold uppercase tracking-[0.08em] text-muted">
                  Departments
                </h2>
                {canStartSomewhere ? (
                  <Button
                    variant="primary"
                    onClick={() => setStartIn({ id: null })}
                    icon={<Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
                  >
                    New project
                  </Button>
                ) : null}
              </div>
              {summaries.length === 0 ? (
                <EmptyState title="No departments yet." body="Projects live inside departments." />
              ) : (
                <DepartmentList items={summaries} onOpen={openDepartment} />
              )}
            </section>

            {unfiled.length > 0 ? <DepartmentSection title="Not in a department yet" projects={unfiled} /> : null}

            {executive ? (
              <div className="flex justify-center pt-2">
                <Button variant="quiet" onClick={openNewDepartment}>
                  New department
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {sheets}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4">{children}</div>;
}
