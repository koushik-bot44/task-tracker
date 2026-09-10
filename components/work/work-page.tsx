"use client";

import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/hooks/use-users";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useDashboardToday, useGroups, useWorkList, type WorkQuery } from "@/lib/hooks/use-work";
import { isAdminRole, isExecutiveRole, isLeadOrAboveRole, oversesCompanyRole } from "@/lib/roles";
import { WORK_PRIORITIES, WORK_PRIORITY_LABEL, WORK_TYPES, WORK_TYPE_LABEL } from "@/lib/types";
import { DepartmentTree } from "./department-tree";
import { TaskTable } from "./task-table";
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

/**
 * What each Show choice asks for. Every choice says which half of the work it
 * means, so a search keeps the choice: searching under Open used to widen to
 * resolved and closed tasks too (review, 2026-09-10).
 */
function sliceQuery(s: Slice): WorkQuery {
  switch (s) {
    case "unassigned":
      return { open: "true", unassigned: true };
    case "overdue":
      return { open: "true", overdue: true };
    // Not a filter: every open task, Critical → High → Medium → Low
    // (owner, 2026-09-10 — "it only shows high priority").
    case "high":
      return { open: "true" };
    case "waiting":
      return { open: "false", state: "WAITING" };
    case "resolved":
      return { open: "false", state: "RESOLVED" };
    case "finished":
      return { open: "false", state: "CLOSED,CANCELLED" };
    case "everything":
      return { open: "false" };
    default:
      return { open: "true" };
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

/** What a link can narrow the list to, each shown as a chip that can be taken off. */
const NARROWINGS = [
  { key: "departmentId", label: "Department" },
  { key: "assignmentGroupId", label: "Team" },
  { key: "assigneeId", label: "Assigned to" },
  { key: "requesterId", label: "Assigned by" },
  { key: "projectId", label: "Project" },
  { key: "dueToday", label: "Due" },
] as const;

/** Every narrowing that is not the tab or Show — together with a search, what Clear filters clears. */
const EXTRA_KEYS = ["departmentId", "assignmentGroupId", "assigneeId", "requesterId", "projectId", "dueToday", "priority", "type", "state", "sort"] as const;

/**
 * The list, the way a service desk shows it: a title bar with New, the
 * scope tabs (All → Departments → your own work), what a link narrowed it to,
 * a condition row (the slice and a search), then a full-width table — Number,
 * Short description, State, Priority, Assigned by, Assigned to, Assigned,
 * Due, Updated — one row per task, 50 a page, the page kept in the address.
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

  const current = params.toString();
  const mineParam = params.get("mine") as Scope | null;
  // A link can land here already narrowed — a department, a team, a person —
  // naming no tab. It lists exactly what the link names: under All for the CEO,
  // for anyone else under the tab that matches (or none), and never under
  // "Your work" while the rows are a whole department (review, 2026-09-10).
  const landedNarrowed = !mineParam && NARROWINGS.some((n) => n.key !== "dueToday" && params.get(n.key));
  const scope: Scope = mineParam ?? (isExecutiveRole(me?.role) || landedNarrowed ? "all" : "assigned");
  const slice = (params.get("f") ?? "open") as Slice;
  const q = params.get("q") ?? "";
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const [raising, setRaising] = useState(false);
  const [draftQ, setDraftQ] = useState(q);
  // The box follows the address — after Clear filters, Back, or a link.
  useEffect(() => setDraftQ(q), [q]);
  /** The extra axes stay folded away; most days "Show" and a search is the whole job. */
  const [moreFilters, setMoreFilters] = useState(false);

  /* Two controls changed in quick succession (Priority, then Type) each built
     on the address still on screen, so the second quietly undid the first and
     Priority looked like it did nothing. A change now builds on the last
     address asked for, until the screen catches up (review, 2026-09-10). */
  const asked = useRef<{ from: string; chain: string[] } | null>(null);
  useEffect(() => {
    const a = asked.current;
    if (!a) return;
    const caughtUp = current === a.chain[a.chain.length - 1];
    const wentElsewhere = current !== a.from && !a.chain.includes(current);
    if (caughtUp || wentElsewhere) asked.current = null;
  }, [current]);
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const a = asked.current;
      const next = new URLSearchParams(a ? a.chain[a.chain.length - 1] : current);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const s = next.toString();
      asked.current = a ? { from: a.from, chain: [...a.chain, s] } : { from: current, chain: [s] };
      router.replace(`${pathname}${s ? `?${s}` : ""}`);
    },
    [current, pathname, router],
  );

  /* Widest first, narrowing to your own: All · Departments · your team ·
     what you handed out · your own work (owner, 2026-09-09). */
  const scopes = useMemo(() => {
    const out: { value: Scope; label: string; count?: number }[] = [];
    if (isExecutiveRole(me?.role)) out.push({ value: "all", label: "All", count: dash?.everythingTotal ?? undefined });
    // The co-founder oversees rather than runs departments, so this tab had
    // nothing of his to open (review, 2026-09-10).
    if ((isLeadOrAboveRole(me?.role) || me?.role === "HOD") && me?.role !== "CO_FOUNDER") out.push({ value: "department", label: "Departments" });
    if (dash?.teams.length) out.push({ value: "team", label: "Your team's work", count: dash.teamWorkTotal });
    // The tasks this person handed out — they raised them, so they own the answer.
    out.push({ value: "requested", label: "Assigned by you" });
    out.push({ value: "assigned", label: "Your work", count: dash?.myWorkTotal });
    return out;
  }, [dash, me]);

  const offered = (v: Scope) => scopes.some((s) => s.value === v);
  const teamParam = params.get("assignmentGroupId");
  const highlighted: Scope | null = offered(scope)
    ? scope
    : landedNarrowed
      ? teamParam && offered("team") && dash?.teams.some((t) => t.id === teamParam)
        ? "team"
        : params.get("departmentId") && offered("department")
          ? "department"
          : null
      : "assigned";

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

  const narrowed = Boolean(q) || EXTRA_KEYS.some((k) => params.get(k));

  const query: WorkQuery = useMemo(() => {
    const base: WorkQuery = {
      ...sliceQuery(slice),
      q: q || undefined,
      sort: params.get("sort") ?? (slice === "high" ? "priority" : slice === "overdue" ? "due" : "updated"),
      // One row per task, counted once, pages numbered.
      rows: "tasks",
      limit: PAGE,
      page: page > 1 ? page : undefined,
    };
    for (const k of ["departmentId", "assignmentGroupId", "assigneeId", "requesterId", "projectId", "dueToday", "priority", "type", "state"]) {
      const v = params.get(k);
      if (v) base[k] = v;
    }
    // A state named in the address (a link) decides by itself which half it is in.
    if (params.get("state")) base.open = "false";
    if (scope !== "all") base.mine = scope;
    return base;
  }, [slice, q, params, scope, page]);

  const { data, isLoading, isError, error, refetch } = useWorkList(query, Boolean(me) && !admin);

  /* What the grouped view narrows by: everything set above except the paging
     and the department/project, which the grouping itself supplies. */
  const groupedFilter: WorkQuery = useMemo(() => {
    const { limit: _l, page: _pg, rows: _r, departmentId: _d, projectId: _p, mine: _m, ...rest } = query;
    void _l; void _pg; void _r; void _d; void _p; void _m;
    return rest;
  }, [query]);

  /* A task given to several people is one row; hovering it names everyone on it. */
  const sharedWith = useMemo(() => {
    const byTask = new Map<string, string[]>();
    for (const t of data?.items ?? []) {
      const names = [...(t.assigneeName ? [t.assigneeName] : []), ...t.alsoWith.map((p) => p.name)];
      if (names.length > 1) byTask.set(t.id, names);
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

  const labels = data?.labels;
  const chips = NARROWINGS.flatMap((n) => {
    const v = params.get(n.key);
    if (!v) return [];
    const value =
      n.key === "departmentId"
        ? labels?.department ?? departments?.find((d) => d.id === v)?.name
        : n.key === "assignmentGroupId"
          ? labels?.team ?? groups?.find((g) => g.id === v)?.name
          : n.key === "assigneeId"
            ? labels?.assignee
            : n.key === "requesterId"
              ? labels?.requester
              : n.key === "projectId"
                ? v === "none" ? "No project" : labels?.project
                : "Today";
    return [{ key: n.key, label: n.label, value: value ?? "…" }];
  });

  const total = data?.total ?? 0;
  const from = (page - 1) * PAGE + 1;
  const to = data ? from + data.items.length - 1 : 0;

  return (
    <div className="w-full px-2 pb-8 pt-2 md:px-4">
      <Panel>
        <PanelHeader
          title={<span>Tasks</span>}
          right={
            <button type="button" onClick={() => setRaising(true)} className={snPrimary}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              New
            </button>
          }
        />
        <Tabs<Scope>
          tabs={scopes}
          value={(highlighted ?? "") as Scope}
          onChange={(v) => set({ mine: v === "all" ? null : v, page: null, ...(v === "all" ? {} : { departmentId: null, assignmentGroupId: null, assigneeId: null }) })}
        />

        {/* Said out loud, and removable: a list that arrived narrowed must not look like everything. */}
        {chips.length ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2" aria-label="The list is narrowed to">
            {chips.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pl-2.5 pr-1 text-[12px] text-primary-ink">
                <span>{c.label}: {c.value}</span>
                <button
                  type="button"
                  onClick={() => set({ [c.key]: null, page: null })}
                  aria-label={`Stop narrowing to ${c.label.toLowerCase()} ${c.value}`}
                  className="press grid h-5 w-5 place-items-center rounded-full hover:bg-hover"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[13px] text-muted">Show</span>
          <select value={slice} onChange={(e) => set({ f: e.target.value === "open" ? null : e.target.value, page: null })} className={cn(snInput, "!w-auto")} aria-label="Which tasks">
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
              onChange={(e) => set({ departmentId: e.target.value || null, assignmentGroupId: null, page: null })}
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
              set({ q: draftQ.trim() || null, page: null });
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
              onClick={() => {
                setMoreFilters(false);
                setDraftQ("");
                set({ ...Object.fromEntries(EXTRA_KEYS.map((k) => [k, null])), q: null, page: null });
              }}
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
                onChange={(e) => set({ assignmentGroupId: e.target.value || null, page: null })}
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
              onChange={(e) => set({ priority: e.target.value || null, page: null })}
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
              onChange={(e) => set({ type: e.target.value || null, page: null })}
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
              onChange={(e) => set({ sort: e.target.value === "updated" ? null : e.target.value, page: null })}
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
            <TaskTable items={data.items} sharedWith={sharedWith} empty={q ? "No records match your search." : "No records to display."} />
            <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[13px] text-muted">
              <span>{total === 0 ? "0 tasks" : `${from} to ${to} of ${total}`}</span>
              <span className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => set({ page: page - 1 > 1 ? String(page - 1) : null })} className={snButton} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
                <button type="button" disabled={page * PAGE >= total} onClick={() => set({ page: String(page + 1) })} className={snButton} aria-label="Next page">
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
