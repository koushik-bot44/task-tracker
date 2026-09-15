"use client";

import Link from "next/link";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";
import { dateWord, formatDMY } from "@/lib/dates";
import { CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import { WORK_PRIORITY_LABEL, WORK_STATE_LABEL, type TaskDTO } from "@/lib/types";
import { WorkCards, meetingWhen } from "./work-cards";
import { snLink } from "./sn";

export type SortDir = "asc" | "desc";
/** Which way a column starts when first clicked: dates and names A→Z, the "latest" columns newest first. */
export function columnDefaultDir(sort: string): SortDir {
  return sort === "updated" || sort === "created" || sort === "number" ? "desc" : "asc";
}
type SortProps = { sort?: string; dir?: SortDir; onSort?: (key: string) => void };

/**
 * The task list, in one place.
 *
 * The queue, a project's tasks and a department opened up all show the same
 * eleven columns, so a row means the same thing wherever it is read. On a phone
 * it becomes stacked rows instead (WorkCards) — the same facts, not fewer.
 */
/**
 * One row per TASK, not per record.
 *
 * A task given to several people is one record each — so each can finish their
 * own — but a list that shows the same words four times reads as four tasks.
 * The records that share a key collapse into the first of them; the row names
 * everybody on it.
 */
export function collapseSiblings(items: TaskDTO[]): TaskDTO[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    if (!t.siblingKey) return true;
    if (seen.has(t.siblingKey)) return false;
    seen.add(t.siblingKey);
    return true;
  });
}

export function TaskTable({
  items,
  sharedWith,
  empty = "No records to display.",
  hideProject = false,
  sort,
  dir,
  onSort,
}: {
  items: TaskDTO[];
  /** Everyone holding the same task, keyed by task id. */
  sharedWith?: Map<string, string[]>;
  empty?: string;
  /** On a project's own page the project column would say the same thing twice. */
  hideProject?: boolean;
} & SortProps) {
  const rows = collapseSiblings(items);
  const s: SortProps = { sort, dir, onSort };
  return (
    <>
      <div className="md:hidden">
        <WorkCards items={rows} sharedWith={sharedWith} hideProject={hideProject} />
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[960px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-hover text-left text-muted">
              <Th sortKey="number" {...s}>Number</Th>
              {/* Short description does not sort: sorting words A→Z tells nobody anything (owner, 2026-09-15). */}
              <Th className="w-[26%]" {...s}>Short description</Th>
              <Th sortKey="department" {...s}>Department</Th>
              {hideProject ? null : <Th sortKey="project" {...s}>Project</Th>}
              <Th sortKey="status" {...s}>Status</Th>
              <Th sortKey="priority" {...s}>Priority</Th>
              <Th sortKey="assignedBy" {...s}>Assigned by</Th>
              <Th sortKey="assignedTo" {...s}>Assigned to</Th>
              <Th sortKey="assigned" {...s}>Assigned</Th>
              <Th sortKey="due" {...s}>Due</Th>
              <Th sortKey="updated" {...s}>Last updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <RowLine key={t.id} t={t} sharedWith={sharedWith?.get(t.id)} hideProject={hideProject} />
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={hideProject ? 10 : 11} className="px-3 py-8 text-center text-muted">
                  {empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({ children, className, sortKey, sort, dir, onSort }: { children: React.ReactNode; className?: string; sortKey?: string } & SortProps) {
  // A column sorts only when a handler and a key are both given (owner, 2026-09-15: only where it applies).
  if (!onSort || !sortKey) return <th className={cn("border-b border-line px-3 py-2 font-semibold", className)}>{children}</th>;
  const active = sort === sortKey;
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("border-b border-line px-3 py-2 font-semibold", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${typeof children === "string" ? children : sortKey}${active ? (dir === "asc" ? ", ascending — click for descending" : ", descending — click for ascending") : ""}`}
        className="group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-ink"
      >
        <span>{children}</span>
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3.5 w-3.5 text-primary-ink" strokeWidth={2.5} aria-hidden /> : <ChevronDown className="h-3.5 w-3.5 text-primary-ink" strokeWidth={2.5} aria-hidden />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-40" strokeWidth={2} aria-hidden />
        )}
      </button>
    </th>
  );
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

function RowLine({ t, sharedWith, hideProject = false }: { t: TaskDTO; sharedWith?: string[]; hideProject?: boolean }) {
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
        {/* When its next meeting is, so a meeting coming up is seen from the list (owner, 2026-09-11). */}
        {t.nextMeeting ? (
          <span title={`Meeting: ${t.nextMeeting.title}`} className="ml-2 inline-flex items-center gap-1 rounded-chip bg-primary-soft px-1.5 py-0.5 align-middle text-micro font-medium text-primary-ink">
            <CalendarClock className="h-3 w-3" strokeWidth={2} aria-hidden />
            {meetingWhen(t.nextMeeting)}
          </span>
        ) : null}
      </td>
      <td className="max-w-[10rem] truncate whitespace-nowrap px-3 py-2 text-ink">{t.departmentName ?? ""}</td>
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
      <td className="whitespace-nowrap px-3 py-2 text-ink">{t.assignedByName ?? ""}</td>
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
