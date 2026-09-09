"use client";

import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import { useMe } from "@/lib/hooks/use-users";
import { useWorkList, type WorkQuery } from "@/lib/hooks/use-work";
import { WORK_PRIORITY_LABEL, WORK_STATE_LABEL, type TaskDTO } from "@/lib/types";
import { NewWorkSheet } from "./new-work-sheet";
import { Panel, PanelHeader, snButton, snInput, snLink, snPrimary } from "./sn";

export type Slice = "open" | "unassigned" | "overdue" | "high" | "waiting" | "resolved" | "finished" | "everything";

export const SLICES: { key: Slice; label: string }[] = [
  { key: "everything", label: "All" },
  { key: "open", label: "Open" },
  { key: "unassigned", label: "Unassigned" },
  { key: "overdue", label: "Overdue" },
  { key: "high", label: "High priority" },
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
 * The task table, the way a service desk lists records: Number, Short
 * description, Project, State, Priority, Assignment group, Assigned to,
 * Requested by, Due, Updated; a Show filter, a search, 50 a page. Drop it
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
  const query: WorkQuery = { ...fixed, ...sliceQuery(slice), q: q || undefined, sort: slice === "overdue" ? "due" : "updated", limit: PAGE, cursor };
  const { data, isLoading, isError, error, refetch } = useWorkList(query, Boolean(me));
  const from = pages.length * PAGE + 1;
  const to = data ? Math.min(from + data.items.length - 1, data.total) : 0;
  const cols = hideProject ? 9 : 10;

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
          <div className="overflow-x-auto">
            <table className={cn("w-full border-collapse text-[13px]", hideProject ? "min-w-[860px]" : "min-w-[960px]")}>
              <thead>
                <tr className="bg-hover text-left text-muted">
                  <Th>Number</Th>
                  <Th className="w-[30%]">Short description</Th>
                  {hideProject ? null : <Th>Project</Th>}
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
                  <RowLine key={t.id} t={t} hideProject={hideProject} />
                ))}
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={cols} className="px-3 py-8 text-center text-muted">
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("border-b border-line px-3 py-2 font-semibold", className)}>{children}</th>;
}

function RowLine({ t, hideProject }: { t: TaskDTO; hideProject: boolean }) {
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
      {hideProject ? null : (
        <td className="max-w-[12rem] truncate whitespace-nowrap px-3 py-2 text-ink">
          {t.projectSlug ? (
            <Link href={`/project/${t.projectSlug}`} className={snLink}>
              {t.projectName}
            </Link>
          ) : (
            ""
          )}
        </td>
      )}
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

export { EmptyState as WorkEmpty };
