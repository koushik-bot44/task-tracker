"use client";

import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/hooks/use-users";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useDashboardToday, useGroups, useWorkList, type WorkQuery } from "@/lib/hooks/use-work";
import { isAdminRole, isExecutiveRole, isLeadOrAboveRole, oversesCompanyRole } from "@/lib/roles";
import { WORK_PRIORITIES, WORK_PRIORITY_LABEL, WORK_TYPES, WORK_TYPE_LABEL } from "@/lib/types";
import { DepartmentTree } from "./department-tree";
import { TaskTable, collapseSiblings } from "./task-table";
import { NewWorkSheet } from "./new-work-sheet";
import { Panel, PanelHeader, Tabs, snButton, snInput, snPrimary } from "./sn";

type Scope = "assigned" | "requested" | "team" | "department" | "all";
type Slice = "open" | "unassigned" | "overdue" | "high" | "waiting" | "resolved" | "finished" | "everything";

const SLICES: { key: Slice; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "overdue", label: "Overdue" },
  { key: "high", label: "Highest priority first" },
  { key: "waiting", label: "On Hold" },
  { key: "resolved", label: "Resolved" },
  { key: "finished", label: "Closed" },
  { key: "everything", label: "All" },
];

function sliceQuery(s: Slice): WorkQuery {
  switch (s) {
    case "unassigned":
      return { unassigned: true };
    case "overdue":
      return { overdue: true };
    // Not a filter: every open task, Critical → High → Medium → Low
    // (owner, 2026-09-10 — "it only shows high priority").
    case "high":
      return {};
    case "waiting":
      return { state: "WAITING" };
    case "resolved":
      return { state: "RESOLVED" };
    case "finished":
      return { state: "CLOSED,CANCELLED" };
    case "everything":
      return { open: "false" };
    default:
      return {};
  }
}

const SORTS: { key: string; label: string }[] = [
  { key: "updated", label: "Last touched" },
  { key: "due", label: "Due date" },
  { key: "priority", label: "Priority" },
  { key: "created", label: "Newest" },
  { key: "number", label: "Number" },
];

const PAGE = 50;

/**
 * The list, the way a service desk shows it: a title bar with New, the
 * the scope tabs (All → Departments → your own work), a condition row (the slice and a
 * search), then a full-width table — Number, Short description, State,
 * Priority, Assigned by, Assigned to, Assigned, Due, Updated —
 * with 50 rows a page.
 */
export function WorkPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const { data: dash } = useDashboardToday(Boolean(me) && !admin);
  const { data: departments } = useDepartments();
  const { data: groups } = useGroups(Boolean(me) && !admin);

  const scope = (params.get("mine") ?? (params.get("departmentId") || params.get("assignmentGroupId") || params.get("assigneeId") || isExecutiveRole(me?.role) ? "all" : "assigned")) as Scope;
  const slice = (params.get("f") ?? "open") as Slice;
  const q = params.get("q") ?? "";
  const cursor = params.get("cursor") ?? undefined;
  const [raising, setRaising] = useState(false);
  const [draftQ, setDraftQ] = useState(q);
  /** The extra axes stay folded away; most days "Show" and a search is the whole job. */
  const [moreFilters, setMoreFilters] = useState(false);
  const [pages, setPages] = useState<string[]>([]);

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

  /* Widest first, narrowing to your own: All · Departments · your team ·
     what you handed out · your own work (owner, 2026-09-09). */
  const scopes = useMemo(() => {
    const out: { value: Scope; label: string; count?: number }[] = [];
    if (isExecutiveRole(me?.role)) out.push({ value: "all", label: "All", count: dash?.everythingTotal ?? undefined });
    if (isLeadOrAboveRole(me?.role) || me?.role === "HOD") out.push({ value: "department", label: "Departments" });
    if (dash?.teams.length) out.push({ value: "team", label: "Your team's work", count: dash.teamWorkTotal });
    // The tasks this person handed out — they raised them, so they own the answer.
    out.push({ value: "requested", label: "Assigned by you" });
    out.push({ value: "assigned", label: "Your work", count: dash?.myWorkTotal });
    return out;
  }, [dash, me]);

  // Which departments this person may narrow the Department tab to. The CEO
  // sees every one; a head sees the ones they head; everybody else has only
  // their own, and is shown no picker at all.
  const departmentChoices = useMemo(() => {
    const all = departments ?? [];
    if (oversesCompanyRole(me?.role)) return all;
    const mine = all.filter((d) => d.hodId === me?.id || d.id === me?.departmentId);
    return [...new Map(mine.map((d) => [d.id, d] as const)).values()];
  }, [departments, me]);

  const teamChoices = useMemo(
    () => (groups ?? []).filter((g) => g.active && (!params.get("departmentId") || g.departmentId === params.get("departmentId"))),
    [groups, params],
  );

  /** Every narrowing that is not the tab or the slice, so one button clears them. */
  const EXTRA_KEYS = ["departmentId", "assignmentGroupId", "assigneeId", "requesterId", "projectId", "dueToday", "priority", "type", "state", "sort"] as const;
  const narrowed = EXTRA_KEYS.some((k) => params.get(k));

  const query: WorkQuery = useMemo(() => {
    const base: WorkQuery = { ...sliceQuery(slice), q: q || undefined, sort: params.get("sort") ?? (slice === "high" ? "priority" : slice === "overdue" ? "due" : "updated"), limit: PAGE, cursor };
    for (const k of ["departmentId", "assignmentGroupId", "assigneeId", "requesterId", "projectId", "dueToday", "priority", "type", "state"]) {
      const v = params.get(k);
      if (v) base[k] = v;
    }
    if (scope !== "all") base.mine = scope;
    return base;
  }, [slice, q, params, scope, cursor]);

  const { data, isLoading, isError, error, refetch } = useWorkList(query, Boolean(me) && !admin);

  /* What the grouped view narrows by: everything set above except the paging
     and the department/project, which the grouping itself supplies. */
  const groupedFilter: WorkQuery = useMemo(() => {
    const { cursor: _c, limit: _l, departmentId: _d, projectId: _p, mine: _m, ...rest } = query;
    void _c; void _l; void _d; void _p; void _m;
    return rest;
  }, [query]);

  /* The same task given to several people is several records — one each, so
     each can finish their own. They share a key, so a row can say how many
     people are on it and name them on hover. */
  const sharedWith = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const t of data?.items ?? []) {
      if (!t.siblingKey || !t.assigneeName) continue;
      byKey.set(t.siblingKey, [...(byKey.get(t.siblingKey) ?? []), t.assigneeName]);
    }
    const byTask = new Map<string, string[]>();
    for (const t of data?.items ?? []) {
      const names = t.siblingKey ? byKey.get(t.siblingKey) : undefined;
      if (names && names.length > 1) byTask.set(t.id, names);
    }
    return byTask;
  }, [data]);


  if (admin) {
    return (
      <div className="w-full px-4 pb-8 pt-4">
        <EmptyState title="Nothing here for your account." body="Accounts are looked after from People." />
      </div>
    );
  }

  const from = pages.length * PAGE + 1;
  // A task given to several people is several records; the list shows it once,
  // so the count has to say tasks too.
  const shownRows = data ? collapseSiblings(data.items).length : 0;
  const hidden = data ? data.items.length - shownRows : 0;
  const to = data ? Math.min(from + shownRows - 1, data.total - hidden) : 0;

  return (
    <div className="w-full px-2 pb-8 pt-2 md:px-4">
      <Panel>
        <PanelHeader
          title={<span>Tasks</span>}
          right={
            <>
              <button type="button" onClick={() => setRaising(true)} className={snPrimary}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                New
              </button>
            </>
          }
        />
        <Tabs<Scope> tabs={scopes} value={scopes.some((s) => s.value === scope) ? scope : "assigned"} onChange={(v) => { setPages([]); set({ mine: v === "all" ? null : v, cursor: null, ...(v === "all" ? {} : { departmentId: null, assignmentGroupId: null, assigneeId: null }) }); }} />

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[13px] text-muted">Show</span>
          <select value={slice} onChange={(e) => { setPages([]); set({ f: e.target.value === "open" ? null : e.target.value, cursor: null }); }} className={cn(snInput, "!w-auto")} aria-label="Which tasks">
            {SLICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>

          {/* On the Department tab, say WHICH department — otherwise the tab can
              only ever mean "all the ones I can see". */}
          {scope === "department" && departmentChoices.length > 1 ? (
            <select
              value={params.get("departmentId") ?? ""}
              onChange={(e) => { setPages([]); set({ departmentId: e.target.value || null, assignmentGroupId: null, cursor: null }); }}
              className={cn(snInput, "!w-auto")}
              aria-label="Department"
            >
              <option value="">Every department</option>
              {departmentChoices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPages([]);
              set({ q: draftQ.trim() || null, cursor: null });
            }}
            className="relative w-full md:ml-auto md:w-72"
          >
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
            <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder="Search number, short description, person" aria-label="Search tasks" className={cn(snInput, "pl-7")} />
          </form>

          <button type="button" onClick={() => setMoreFilters((v) => !v)} aria-expanded={moreFilters} className={snButton}>
            {moreFilters ? "Fewer filters" : "More filters"}
          </button>

          {narrowed ? (
            <button
              type="button"
              onClick={() => { setPages([]); setMoreFilters(false); set({ ...Object.fromEntries(EXTRA_KEYS.map((k) => [k, null])), cursor: null }); }}
              className={snButton}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {moreFilters ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-hover/40 px-3 py-2">
          {teamChoices.length ? (
            <select
              value={params.get("assignmentGroupId") ?? ""}
              onChange={(e) => { setPages([]); set({ assignmentGroupId: e.target.value || null, cursor: null }); }}
              className={cn(snInput, "!w-auto")}
              aria-label="Team"
            >
              <option value="">Any team</option>
              {teamChoices.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : null}

          <select
            value={params.get("priority") ?? ""}
            onChange={(e) => { setPages([]); set({ priority: e.target.value || null, cursor: null }); }}
            className={cn(snInput, "!w-auto")}
            aria-label="Priority"
          >
            <option value="">Any priority</option>
            {WORK_PRIORITIES.map((pr) => (
              <option key={pr} value={pr}>
                {WORK_PRIORITY_LABEL[pr]}
              </option>
            ))}
          </select>

          <select
            value={params.get("type") ?? ""}
            onChange={(e) => { setPages([]); set({ type: e.target.value || null, cursor: null }); }}
            className={cn(snInput, "!w-auto")}
            aria-label="Type"
          >
            <option value="">Any type</option>
            {WORK_TYPES.map((t) => (
              <option key={t} value={t}>
                {WORK_TYPE_LABEL[t]}
              </option>
            ))}
          </select>

          <select
            value={params.get("sort") ?? (slice === "high" ? "priority" : slice === "overdue" ? "due" : "updated")}
            onChange={(e) => { setPages([]); set({ sort: e.target.value === "updated" ? null : e.target.value, cursor: null }); }}
            className={cn(snInput, "!w-auto")}
            aria-label="Order"
          >
            {SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          </div>
        ) : null}

        {scope === "department" && !params.get("departmentId") ? (
          <DepartmentTree departments={departmentChoices} filter={groupedFilter} />
        ) : isLoading || !me ? (
          <div className="p-3"><Skeleton rows={6} /></div>
        ) : isError || !data ? (
          <div className="p-3"><ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} /></div>
        ) : (
          <>
            <TaskTable items={data.items} sharedWith={sharedWith} empty={q ? "No records match your search." : "No records to display."} />           <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[13px] text-muted">
              <span>{data.total === 0 ? "0 tasks" : `${from} to ${to} of ${data.total - hidden}`}</span>
              <span className="flex items-center gap-1">
                <button type="button" disabled={pages.length === 0} onClick={() => { const prev = [...pages]; prev.pop(); setPages(prev); set({ cursor: prev[prev.length - 1] ?? null }); }} className={snButton} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
                <button type="button" disabled={!data.nextCursor} onClick={() => { if (data.nextCursor) { setPages([...pages, data.nextCursor]); set({ cursor: data.nextCursor }); } }} className={snButton} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              </span>
            </div>
          </>
        )}
      </Panel>
      <NewWorkSheet open={raising} onClose={() => setRaising(false)} />
    </div>
  );
}



