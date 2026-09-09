"use client";

import { ChevronLeft, ChevronRight, Plus, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import { useMe } from "@/lib/hooks/use-users";
import { useDashboardToday, useWorkList, type WorkQuery } from "@/lib/hooks/use-work";
import { isAdminRole, isLeadOrAboveRole } from "@/lib/roles";
import { WORK_PRIORITY_LABEL, WORK_STATE_LABEL, type TaskDTO } from "@/lib/types";
import { DepartmentBoard } from "./department-board";
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

const PAGE = 50;

/**
 * The list, the way a service desk shows it: a title bar with New, the
 * "Your work / Your team's work" tabs, a condition row (the slice and a
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

  const scope = (params.get("mine") ?? (params.get("departmentId") || params.get("assignmentGroupId") || params.get("assigneeId") || me?.role === "FOUNDER" ? "all" : "assigned")) as Scope;
  const slice = (params.get("f") ?? "open") as Slice;
  const q = params.get("q") ?? "";
  const cursor = params.get("cursor") ?? undefined;
  const [raising, setRaising] = useState(false);
  const [draftQ, setDraftQ] = useState(q);
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

  const scopes = useMemo(() => {
    const out: { value: Scope; label: string; count?: number }[] = [{ value: "assigned", label: "Your work", count: dash?.myWorkTotal }, { value: "requested", label: "Requested by you" }];
    if (dash?.teams.length) out.push({ value: "team", label: "Your team's work", count: dash.teamWorkTotal });
    if (isLeadOrAboveRole(me?.role) || me?.role === "HOD") out.push({ value: "department", label: "Department" });
    if (me?.role === "FOUNDER") out.push({ value: "all", label: "All", count: dash?.everythingTotal ?? undefined });
    return out;
  }, [dash, me]);

  const query: WorkQuery = useMemo(() => {
    const base: WorkQuery = { ...sliceQuery(slice), q: q || undefined, sort: slice === "overdue" ? "due" : "updated", limit: PAGE, cursor };
    for (const k of ["departmentId", "assignmentGroupId", "assigneeId", "requesterId", "projectId", "dueToday"]) {
      const v = params.get(k);
      if (v) base[k] = v;
    }
    if (scope !== "all") base.mine = scope;
    return base;
  }, [slice, q, params, scope, cursor]);

  const { data, isLoading, isError, error, refetch } = useWorkList(query, Boolean(me) && !admin);

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
              {me?.role === "FOUNDER" || me?.role === "HOD" ? (
                <Link href="/work/rules" className={snButton}>
                  <Settings2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Assignment Rules
                </Link>
              ) : null}
              {me?.role === "FOUNDER" || me?.role === "HOD" ? (
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPages([]);
              set({ q: draftQ.trim() || null, cursor: null });
            }}
            className="relative w-full md:ml-auto md:w-80"
          >
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
            <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder="Search number, short description, person" aria-label="Search tasks" className={cn(snInput, "pl-7")} />
          </form>
          {params.get("departmentId") || params.get("assignmentGroupId") || params.get("assigneeId") ? (
            <button type="button" onClick={() => set({ departmentId: null, assignmentGroupId: null, assigneeId: null, cursor: null })} className={snButton}>
              Clear filter
            </button>
          ) : null}
        </div>

        {isLoading || !me ? (
          <div className="p-3"><Skeleton rows={6} /></div>
        ) : isError || !data ? (
          <div className="p-3"><ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-hover text-left text-muted">
                    <Th>Number</Th>
                    <Th className="w-[34%]">Short description</Th>
                    <Th>State</Th>
                    <Th>Priority</Th>
                    <Th>Assignment group</Th>
                    <Th>Assigned to</Th>
                    <Th>Requested by</Th>
                    <Th>Due</Th>
                    <Th>Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <RowLine key={t.id} t={t} />
                  ))}
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-muted">
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

function RowLine({ t }: { t: TaskDTO }) {
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
      <td className="whitespace-nowrap px-3 py-2 text-ink">{WORK_STATE_LABEL[t.state]}</td>
      <td className={cn("whitespace-nowrap px-3 py-2", t.priority === "CRITICAL" ? "font-semibold text-danger-ink" : t.priority === "HIGH" ? "text-warn-ink" : "text-ink")}>{WORK_PRIORITY_LABEL[t.priority]}</td>
      <td className="whitespace-nowrap px-3 py-2 text-ink">{t.assignmentGroupName ?? ""}</td>
      <td className="whitespace-nowrap px-3 py-2 text-ink">{t.assigneeName ?? ""}</td>
      <td className="whitespace-nowrap px-3 py-2 text-ink">{t.requesterName ?? ""}</td>
      <td className={cn("whitespace-nowrap px-3 py-2", late ? "text-danger-ink" : "text-ink")}>{t.dueDate ? dateWord(t.dueDate) : ""}</td>
      <td className="whitespace-nowrap px-3 py-2 text-muted">{dateWord(t.updatedAt)}</td>
    </tr>
  );
}
