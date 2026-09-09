"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { DateChip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import type { TaskDTO } from "@/lib/types";
import { PriorityChip, StateChip } from "./work-chips";

/**
 * One line of the Work list: title, then who has it and which team, with the
 * state and the date on the right. The whole row opens the record.
 */
export function WorkRow({ task, showState = true }: { task: TaskDTO; showState?: boolean }) {
  const title = task.title.trim() || "Untitled";
  const who = task.assigneeName ?? "Nobody yet";
  const meta = [task.ref, who, task.assignmentGroupName, task.departmentName].filter(Boolean).join(" · ");
  return (
    <Link href={`/work/${task.number}`} className="press flex min-h-[56px] items-center gap-3 px-4 text-left" aria-label={`${task.ref} ${title}`}>
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-1.5 text-row", task.status === "DONE" ? "text-muted" : "text-ink")}>
          {task.important ? <Star className="h-4 w-4 shrink-0 fill-primary text-primary" aria-label="Important" /> : null}
          <span className="truncate">{title}</span>
        </span>
        <span className="block truncate text-micro text-muted">{meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <PriorityChip priority={task.priority} />
        {task.dueDate && task.status !== "DONE" ? <DateChip iso={task.dueDate} status={task.status} /> : null}
        {showState ? <StateChip state={task.state} /> : null}
      </span>
    </Link>
  );
}
