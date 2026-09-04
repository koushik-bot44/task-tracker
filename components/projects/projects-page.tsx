"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { DepartmentSection } from "@/components/projects/department-section";
import { DepartmentSheet } from "@/components/sheets/department-sheet";
import { NewProjectSheet } from "@/components/sheets/new-project-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { inputClass } from "@/components/ui/sheet";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMe } from "@/lib/hooks/use-users";
import { isExecutiveRole, isHodRole } from "@/lib/roles";
import type { DepartmentDTO, ProjectDTO } from "@/lib/types";

type View = "all" | "mine" | "behind";

/** Behind first, then the rest in their order, finished projects last. */
function rank(p: ProjectDTO): number {
  if (p.status === "DONE") return 2;
  if (p.behind) return 0;
  return 1;
}

function byRankThenOrder(a: ProjectDTO, b: ProjectDTO): number {
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  return a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0;
}

/**
 * Projects: every project you can see, grouped by department. Find one, or
 * narrow to Mine / Behind; tap a card to open it; "+ New project" on a
 * department header starts one there.
 */
export function ProjectsPage() {
  const { data: me } = useMe();
  const projectsQuery = useProjects();
  const departmentsQuery = useDepartments();

  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("all");
  /** Which department "+ New project" was tapped on; null id = pick one in the sheet. */
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
  const mineCount = projects.filter(isMine).length;
  const behindCount = projects.filter((p) => p.behind).length;

  const needle = q.trim().toLowerCase();
  const filtering = needle.length > 0 || view !== "all";
  const shown = projects.filter((p) => {
    if (view === "mine" && !isMine(p)) return false;
    if (view === "behind" && !p.behind) return false;
    return needle.length === 0 || p.name.toLowerCase().includes(needle);
  });

  const known = new Set(departments.map((d) => d.id));
  const byDepartment = new Map<string, ProjectDTO[]>();
  const unfiled: ProjectDTO[] = [];
  for (const p of shown) {
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

  if (projects.length === 0) {
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
            ) : executive && departments.length === 0 ? (
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

  return (
    <Shell>
      <div className="space-y-6">
        <div className="space-y-3">
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
          <Segmented<View>
            label="Which projects"
            value={view}
            onChange={setView}
            className="md:max-w-sm"
            options={[
              { value: "all", label: "All" },
              { value: "mine", label: "Mine", count: mineCount },
              { value: "behind", label: "Behind", count: behindCount },
            ]}
          />
        </div>

        {shown.length === 0 ? (
          <EmptyState
            title={needle ? "No project called that." : view === "mine" ? "You're not on a project yet." : "Nothing is behind."}
            body={needle ? "Check the spelling, or clear the search." : undefined}
          />
        ) : (
          <div className="space-y-8">
            {departments.map((d) => {
              const list = byDepartment.get(d.id) ?? [];
              if (filtering && list.length === 0) return null;
              return (
                <DepartmentSection
                  key={d.id}
                  title={d.name}
                  projects={list}
                  canEdit={canEditDepartment(d)}
                  canStart={canStartIn(d)}
                  onEdit={() => {
                    setEditing(d);
                    setDepartmentSheetOpen(true);
                  }}
                  onStart={() => setStartIn({ id: d.id, name: d.name })}
                />
              );
            })}
            {unfiled.length > 0 ? <DepartmentSection title="Not in a department yet" projects={unfiled} /> : null}
          </div>
        )}

        {executive && !filtering ? (
          <div className="flex justify-center pt-2">
            <Button variant="quiet" onClick={openNewDepartment}>
              New department
            </Button>
          </div>
        ) : null}
      </div>
      {sheets}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4">{children}</div>;
}
