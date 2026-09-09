"use client";

import { Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { inputClass } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/hooks/use-users";
import { useDashboardToday, useWorkList, type WorkQuery } from "@/lib/hooks/use-work";
import { isAdminRole, isLeadOrAboveRole } from "@/lib/roles";
import { DepartmentBoard } from "./department-board";
import { NewWorkSheet } from "./new-work-sheet";
import { WorkRow } from "./work-row";

type Scope = "assigned" | "requested" | "team" | "department" | "all";
type Slice = "open" | "unassigned" | "overdue" | "high" | "waiting" | "finished";

const SLICES: { key: Slice; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "unassigned", label: "Nobody yet" },
  { key: "overdue", label: "Late" },
  { key: "high", label: "High priority" },
  { key: "waiting", label: "Waiting" },
  { key: "finished", label: "Finished" },
];

function sliceQuery(s: Slice): WorkQuery {
  switch (s) {
    case "unassigned":
      return { unassigned: true };
    case "overdue":
      return { overdue: true };
    case "high":
      return { priority: "CRITICAL,HIGH" };
    case "waiting":
      return { state: "WAITING" };
    case "finished":
      return { open: "finished" };
    default:
      return {};
  }
}

/**
 * Work: everything you may see, as one list. Mine · Asked · Team · Department
 * · Everything across the top (only the ones that apply to you), a search box,
 * a row of slices, then the rows. Heads and the CEO can flip to the
 * department view. The + raises a task without a project.
 */
export function WorkPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const { data: dash } = useDashboardToday(Boolean(me) && !admin);

  // The CEO holds nothing themselves: their list opens on everything.
  const scope = (params.get("mine") ?? (params.get("departmentId") || params.get("assignmentGroupId") || params.get("assigneeId") || me?.role === "FOUNDER" ? "all" : "assigned")) as Scope;
  const slice = (params.get("f") ?? "open") as Slice;
  const q = params.get("q") ?? "";
  const view = params.get("view") === "departments" ? "departments" : "list";
  const [raising, setRaising] = useState(false);
  const [draftQ, setDraftQ] = useState(q);

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
    },
    [params, pathname, router],
  );

  const scopes = useMemo(() => {
    const out: { value: Scope; label: string; count?: number }[] = [{ value: "assigned", label: "Mine", count: dash?.myWorkTotal }, { value: "requested", label: "Asked" }];
    if (dash?.teams.length) out.push({ value: "team", label: "Team", count: dash.teamWorkTotal });
    if (isLeadOrAboveRole(me?.role) || me?.role === "HOD") out.push({ value: "department", label: "Department" });
    if (me?.role === "FOUNDER") out.push({ value: "all", label: "Everything", count: dash?.everythingTotal ?? undefined });
    return out;
  }, [dash, me]);

  const query: WorkQuery = useMemo(() => {
    const base: WorkQuery = { ...sliceQuery(slice), q: q || undefined, sort: slice === "overdue" ? "due" : "updated", limit: 100 };
    for (const k of ["departmentId", "assignmentGroupId", "assigneeId", "requesterId", "projectId", "dueToday"]) {
      const v = params.get(k);
      if (v) base[k] = v;
    }
    if (scope !== "all") base.mine = scope;
    return base;
  }, [slice, q, params, scope]);

  const { data, isLoading, isError, error, refetch } = useWorkList(query, Boolean(me) && !admin && view === "list");
  const canBoard = me?.role === "FOUNDER" || me?.role === "HOD";

  if (admin) {
    return (
      <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4">
        <EmptyState title="Nothing here for your account." body="Accounts are looked after from People." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-24 pt-4">
      <div className="space-y-3">
        {canBoard ? (
          <Segmented<"list" | "departments">
            label="View"
            value={view}
            onChange={(v) => set({ view: v === "departments" ? "departments" : null })}
            options={[
              { value: "list", label: "List" },
              { value: "departments", label: "By department" },
            ]}
            className="w-full md:w-72"
          />
        ) : null}

        {view === "departments" ? (
          <DepartmentBoard />
        ) : (
          <>
            <Segmented<Scope> label="Whose work" value={scopes.some((s) => s.value === scope) ? scope : "assigned"} onChange={(v) => set({ mine: v === "all" ? null : v, ...(v === "all" ? {} : { departmentId: null, assignmentGroupId: null, assigneeId: null }) })} options={scopes} />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                set({ q: draftQ.trim() || null });
              }}
              className="relative"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
              <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder="Find a task by its words, number or person" aria-label="Find a task" className={cn(inputClass, "pl-10")} />
            </form>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {SLICES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => set({ f: s.key === "open" ? null : s.key })}
                  aria-pressed={slice === s.key}
                  className={cn("press h-8 shrink-0 rounded-chip px-3 text-micro font-medium", slice === s.key ? "bg-ink text-on-ink" : "bg-hover text-muted hover:text-ink")}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {isLoading || !me ? (
              <Skeleton rows={5} />
            ) : isError || !data ? (
              <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
            ) : data.items.length === 0 ? (
              <EmptyState title={q ? "Nothing matches that." : slice === "open" ? "Nothing open here." : "Nothing here."} />
            ) : (
              <>
                <Card className="divide-y divide-line overflow-hidden">
                  {data.items.map((t) => (
                    <WorkRow key={t.id} task={t} />
                  ))}
                </Card>
                <p className="px-1 text-micro text-muted">
                  {data.total} {data.total === 1 ? "task" : "tasks"}
                  {data.nextCursor ? " · showing the first 100" : ""}
                </p>
              </>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setRaising(true)}
        aria-label="New task"
        title="New task"
        className="press fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-sticky grid h-14 w-14 place-items-center rounded-full bg-primary text-on-primary shadow-e2 md:bottom-6 md:right-6"
      >
        <Plus className="h-7 w-7" strokeWidth={2.25} aria-hidden />
      </button>
      <NewWorkSheet open={raising} onClose={() => setRaising(false)} />
    </div>
  );
}
