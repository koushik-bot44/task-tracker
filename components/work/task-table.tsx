"use client";

import Link from "next/link";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";
import { dateWord, formatDMY } from "@/lib/dates";
import { WORK_PRIORITY_LABEL, WORK_STATE_LABEL, type TaskDTO } from "@/lib/types";
import { WorkCards } from "./work-cards";
import { snLink } from "./sn";

/**
 * The task list, in one place.
 *
 * The queue, a project's tasks and a department opened up all show the same
 * eleven columns, so a row means the same thing wherever it is read. On a phone
 * it becomes stacked rows instead (WorkCards) — the same facts, not fewer.
 */
export function TaskTable({
  items,
  sharedWith,
  empty = "No records to display.",
}: {
  items: TaskDTO[];
  /** Everyone holding the same task, keyed by task id. */
  sharedWith?: Map<string, string[]>;
  empty?: string;
}) {
  return (
    <>
      <div className="md:hidden">
        <WorkCards items={items} sharedWith={sharedWith} />
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
            {items.map((t) => (
              <RowLine key={t.id} t={t} sharedWith={sharedWith?.get(t.id)} />
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted">
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
