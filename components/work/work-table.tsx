"use client";

import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/hooks/use-users";
import { useWorkList, type WorkQuery } from "@/lib/hooks/use-work";
import { TaskTable, collapseSiblings } from "./task-table";
import { NewWorkSheet } from "./new-work-sheet";
import { Panel, PanelHeader, snButton, snInput, snPrimary } from "./sn";

export type Slice = "open" | "unassigned" | "overdue" | "high" | "waiting" | "resolved" | "finished" | "everything";

export const SLICES: { key: Slice; label: string }[] = [
  { key: "everything", label: "All" },
  { key: "open", label: "Open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "overdue", label: "Overdue" },
  { key: "high", label: "Highest priority first" },
  { key: "waiting", label: "On Hold" },
  { key: "resolved", label: "Resolved" },
  { key: "finished", label: "Closed" },
];

export function sliceQuery(s: Slice): WorkQuery {
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

const PAGE = 50;

/**
 * The task table, the way a service desk lists records: Number, Short
 * description, Project, State, Priority, Assignment group, Assigned to,
 * Assigned, Due, Updated; a Show filter, a search, 50 a page. Drop it
 * on the Work page, inside a project, or inside a department with `fixed`.
 */
export function WorkTable({
  fixed,
  title = "Tasks",
  defaultSlice = "open",
  hideProject = false,
  presetProjectId,
  presetDepartmentId,
  headerRight,
  tabs,
}: {
  fixed: WorkQuery;
  title?: React.ReactNode;
  defaultSlice?: Slice;
  hideProject?: boolean;
  presetProjectId?: string | null;
  presetDepartmentId?: string | null;
  headerRight?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  const { data: me } = useMe();
  const [slice, setSlice] = useState<Slice>(defaultSlice);
  const [draftQ, setDraftQ] = useState("");
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [raising, setRaising] = useState(false);
  const cursor = pages[pages.length - 1];
  const query: WorkQuery = { ...fixed, ...sliceQuery(slice), q: q || undefined, sort: slice === "high" ? "priority" : slice === "overdue" ? "due" : "updated", limit: PAGE, cursor };
  const { data, isLoading, isError, error, refetch } = useWorkList(query, Boolean(me));
  const from = pages.length * PAGE + 1;
  // A task given to several people is several records; the list shows it once,
  // so the count has to say tasks too.
  const sharedWith = new Map<string, string[]>();
  for (const t of data?.items ?? []) {
    if (!t.siblingKey) continue;
    const names = [...(t.assigneeName ? [t.assigneeName] : []), ...t.alsoWith.map((x) => x.name)];
    if (names.length > 1) sharedWith.set(t.id, names);
  }
  const shownRows = data ? collapseSiblings(data.items).length : 0;
  const hidden = data ? data.items.length - shownRows : 0;
  const to = data ? Math.min(from + shownRows - 1, data.total - hidden) : 0;

  return (
    <Panel>
      <PanelHeader
        title={title}
        right={
          <>
            {headerRight}
            <button type="button" onClick={() => setRaising(true)} className={snPrimary}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              New
            </button>
          </>
        }
      />
      {tabs}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-[13px] text-muted">Show</span>
        <select value={slice} onChange={(e) => { setPages([]); setSlice(e.target.value as Slice); }} className={cn(snInput, "!w-auto")} aria-label="Which tasks">
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
            setQ(draftQ.trim());
          }}
          className="relative w-full md:ml-auto md:w-80"
        >
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
          <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder="Search number, short description, person" aria-label="Search tasks" className={cn(snInput, "pl-7")} />
        </form>
      </div>

      {isLoading || !me ? (
        <div className="p-3"><Skeleton rows={5} /></div>
      ) : isError || !data ? (
        <div className="p-3"><ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} /></div>
      ) : (
        <>
          {/* One list, shared with the queue: the same columns everywhere, one
              row per task, stacked rows on a phone. */}
          <TaskTable
            items={data.items}
            sharedWith={sharedWith}
            hideProject={hideProject}
            empty={q ? "No records match your search." : "No records to display."}
          />
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[13px] text-muted">
            <span>{data.total === 0 ? "0 tasks" : `${from} to ${to} of ${data.total - hidden}`}</span>
            <span className="flex items-center gap-1">
              <button type="button" disabled={pages.length === 0} onClick={() => setPages((p) => p.slice(0, -1))} className={snButton} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button type="button" disabled={!data.nextCursor} onClick={() => { if (data.nextCursor) setPages((p) => [...p, data.nextCursor!]); }} className={snButton} aria-label="Next page">
                <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </span>
          </div>
        </>
      )}
      {data && data.items.length === 0 && !q && slice === "open" && !isLoading ? null : null}
      <NewWorkSheet open={raising} onClose={() => setRaising(false)} presetProjectId={presetProjectId ?? null} presetDepartmentId={presetDepartmentId ?? null} />
    </Panel>
  );
}



export { EmptyState as WorkEmpty };
