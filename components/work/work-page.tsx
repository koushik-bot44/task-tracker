"use client";

import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Tooltip } from "@/components/tooltip";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { dateWord, formatDMY } from "@/lib/dates";
import { useMe } from "@/lib/hooks/use-users";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useDashboardToday, useGroups, useWorkList, type WorkQuery } from "@/lib/hooks/use-work";
import { isAdminRole, isExecutiveRole, isLeadOrAboveRole } from "@/lib/roles";
import { WORK_PRIORITIES, WORK_PRIORITY_LABEL, WORK_STATE_LABEL, WORK_TYPES, WORK_TYPE_LABEL, type TaskDTO } from "@/lib/types";
import { DepartmentBoard } from "./department-board";
import { DepartmentTree } from "./department-tree";
import { WorkCards } from "./work-cards";
import { NewWorkSheet } from "./new-work-sheet";
import { Panel, PanelHeader, Tabs, snButton, snInput, snLink, snPrimary } from "./sn";

type Scope = "assigned" | "requested" | "team" | "department" | "all";
type Slice = "open" | "unassigned" | "overdue" | "high" | "waiting" | "resolved" | "finished" | "everything";

const SLICES: { key: Slice; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "overdue", label: "Overdue" },
  { key: "high", label: "High priority" },
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
    case "high":
      return { priority: "CRITICAL,HIGH" };
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
 * Priority, Assignment group, Assigned to, Requested by, Due, Updated —
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
    if (isExecutiveRole(me?.role)) return all;
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
    const base: WorkQuery = { ...sliceQuery(slice), q: q || undefined, sort: params.get("sort") ?? (slice === "overdue" ? "due" : "updated"), limit: PAGE, cursor };
    for (const k of ["departmentId", "assignmentGroupId", "assigneeId", "requesterId", "projectId", "dueToday", "priority", "type", "state"]) {
      const v = params.get(k);
      if (v) base[k] = v;
    }
    if (scope !== "all") base.mine = scope;
    return base;
  }, [slice, q, params, scope, cursor]);

  const { data, isLoading, isError, error, refetch } = useWorkList(query, Boolean(me) && !admin);

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
  const to = data ? Math.min(from + data.items.length - 1, data.total) : 0;

  if (params.get("view") === "departments") {
    return (
      <div className="w-full px-2 pb-8 pt-2 md:px-4">
        <Panel>
          <PanelHeader title="Tasks by department" right={<Link href="/work" className={snButton}>List</Link>} />
          <div className="p-3">
            <DepartmentBoard />
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="w-full px-2 pb-8 pt-2 md:px-4">
      <Panel>
        <PanelHeader
          title={<span>Tasks</span>}
          right={
            <>
              {isExecutiveRole(me?.role) || me?.role === "HOD" ? (
                <Link href="/work?view=departments" className={snButton}>
                  By department
                </Link>
              ) : null}
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
            value={params.get("sort") ?? (slice === "overdue" ? "due" : "updated")}
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

        {scope === "department" && !params.get("departmentId") && !q ? (
          <DepartmentTree departments={departmentChoices} />
        ) : isLoading || !me ? (
          <div className="p-3"><Skeleton rows={6} /></div>
        ) : isError || !data ? (
          <div className="p-3"><ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} /></div>
        ) : (
          <>
            {/* A phone reads the rows stacked; the ten-column table starts at md. */}
            <div className="md:hidden">
              <WorkCards items={data.items} sharedWith={sharedWith} />
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-hover text-left text-muted">
                    <Th>Number</Th>
                    <Th className="w-[26%]">Short description</Th>
                    <Th>Department</Th>
                    <Th>Project</Th>
                    <Th>State</Th>
                    <Th>Priority</Th>
                    <Th>Assigned by</Th>
                    <Th>Assigned to</Th>
                    <Th>Assigned</Th>
                    <Th>Due</Th>
                    <Th>Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <RowLine key={t.id} t={t} sharedWith={sharedWith.get(t.id)} />
                  ))}
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-muted">
                        {q ? "No records match your search." : "No records to display."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[13px] text-muted">
              <span>{data.total === 0 ? "0 records" : `${from} to ${to} of ${data.total}`}</span>
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("border-b border-line px-3 py-2 font-semibold", className)}>{children}</th>;
}

/** The names behind a count, one per line, so a hover answers "who exactly?". */
function PeopleList({ title, names }: { title: string; names: string[] }) {
  return (
    <span className="block text-left">
      <span className="block font-medium">{title}</span>
      {names.map((n, i) => (
        <span key={`${n}-${i}`} className="block">
          {n}
        </span>
      ))}
    </span>
  );
}

function RowLine({ t, sharedWith }: { t: TaskDTO; sharedWith?: string[] }) {
  const late = t.dueDate && t.status !== "DONE" && new Date(t.dueDate).getTime() < Date.now() - 86_400_000;
  return (
    <tr className="border-b border-line hover:bg-hover">
      <td className="whitespace-nowrap px-3 py-2">
        <Link href={`/work/${t.number}`} className={cn(snLink, "font-medium")}>
          {t.ref}
        </Link>
      </td>
      <td className="max-w-0 truncate px-3 py-2 text-ink">
        <Link href={`/work/${t.number}`} className="hover:underline">
          {t.title.trim() || "(empty)"}
        </Link>
      </td>
      <td className="max-w-[10rem] truncate whitespace-nowrap px-3 py-2 text-ink">{t.departmentName ?? ""}</td>
      <td className="max-w-[12rem] truncate whitespace-nowrap px-3 py-2 text-ink">
        {t.projectSlug ? (
          <Link href={`/project/${t.projectSlug}`} className={snLink}>
            {t.projectName}
          </Link>
        ) : (
          ""
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-ink">{WORK_STATE_LABEL[t.state]}</td>
      <td className={cn("whitespace-nowrap px-3 py-2", t.priority === "CRITICAL" ? "font-semibold text-danger-ink" : t.priority === "HIGH" ? "text-warn-ink" : "text-ink")}>{WORK_PRIORITY_LABEL[t.priority]}</td>
      <td className="whitespace-nowrap px-3 py-2 text-ink">{t.givenByName ?? ""}</td>
      <td className="whitespace-nowrap px-3 py-2 text-ink">
        {sharedWith && sharedWith.length > 1 ? (
          <Tooltip content={<PeopleList title={`This task went to ${sharedWith.length} people`} names={sharedWith} />}>
            <span className="underline decoration-dotted underline-offset-2">
              {/* This record may hold nobody while the others do; the row still
                  has to say how many people the task went to. */}
              {t.assigneeName ?? `${sharedWith.length} people`}
              {t.assigneeName ? (
                <span className="ml-1 rounded-chip bg-hover px-1.5 py-0.5 text-micro font-medium text-muted">+{sharedWith.length - 1}</span>
              ) : null}
            </span>
          </Tooltip>
        ) : (
          t.assigneeName ?? ""
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-ink">{t.assignedAt ? formatDMY(t.assignedAt) : ""}</td>
      <td className={cn("whitespace-nowrap px-3 py-2", late ? "text-danger-ink" : "text-ink")}>{t.dueDate ? dateWord(t.dueDate) : ""}</td>
      <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDMY(t.updatedAt)}</td>
    </tr>
  );
}
