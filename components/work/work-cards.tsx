"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import { WORK_PRIORITY_LABEL, WORK_STATE_LABEL, type TaskDTO } from "@/lib/types";

/**
 * The task list on a phone.
 *
 * The table is ten columns wide and a phone shows two of them, so on a small
 * screen the list becomes one readable row per task instead: what it is, then
 * the things you actually scan for — state, priority, who holds it, when it is
 * due. The table itself starts at `md`. Nothing is hidden that the table shows;
 * it is the same facts, stacked.
 */
export function WorkCards({
  items,
  hideProject = false,
  /** Everyone holding the same task, when it went to several people at once. */
  sharedWith,
}: {
  items: TaskDTO[];
  hideProject?: boolean;
  sharedWith?: Map<string, string[]>;
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((t) => {
        const late = t.dueDate && t.status !== "DONE" && new Date(t.dueDate).getTime() < Date.now() - 86_400_000;
        const crew = sharedWith?.get(t.id);
        return (
          <li key={t.id}>
            <Link href={`/work/${t.number}`} className="press flex min-h-[64px] flex-col justify-center gap-1 px-3 py-2.5 active:bg-hover">
              <span className="flex items-baseline gap-2">
                <span className="shrink-0 text-micro font-medium text-primary-ink">{t.ref}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{t.title.trim() || "(empty)"}</span>
              </span>

              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro text-muted">
                <span>{WORK_STATE_LABEL[t.state]}</span>
                <span aria-hidden>·</span>
                <span className={cn(t.priority === "CRITICAL" ? "font-semibold text-danger-ink" : t.priority === "HIGH" ? "text-warn-ink" : undefined)}>
                  {WORK_PRIORITY_LABEL[t.priority]}
                </span>
                {t.dueDate ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className={cn(late && "font-medium text-danger-ink")}>due {dateWord(t.dueDate)}</span>
                  </>
                ) : null}
                {hideProject || !t.projectName ? null : (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate">{t.projectName}</span>
                  </>
                )}
              </span>

              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro text-muted">
                {/* A task given to several people names them all — no hover on a phone. */}
                {crew && crew.length > 1 ? (
                  <span className="text-ink">
                    {crew.length} people: {crew.join(", ")}
                  </span>
                ) : t.assigneeName ? (
                  <span className="text-ink">{t.assigneeName}</span>
                ) : (
                  <span>Nobody yet</span>
                )}
                {t.assignmentGroupName ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{t.assignmentGroupName}</span>
                  </>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
