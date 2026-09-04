"use client";

import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PROJECT_PRIORITY_LABEL,
  type ProjectPriorityValue,
} from "@/lib/types";

/** Sort helper: Critical first. Company/department lists order by this, then
    deadline, then name — one rule everywhere. */
export const PRIORITY_ORDER: Record<ProjectPriorityValue, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * The project priority pill (phase 48). Only the top two levels carry color —
 * Critical filled red, High filled amber — so red keeps its pop; Medium and
 * Low are quiet outlines. Sentence case, never all-caps.
 */
export function PriorityPill({ priority, className }: { priority: ProjectPriorityValue; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-chip px-2 py-px text-micro font-semibold",
        priority === "CRITICAL" && "bg-danger text-on-primary",
        priority === "HIGH" && "bg-warn text-on-fill",
        (priority === "MEDIUM" || priority === "LOW") && "border border-line text-muted",
        className,
      )}
    >
      {PROJECT_PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Relative deadline words a non-technical reader parses instantly. */
export function deadlineInfo(deadline: string | null): {
  label: string;
  tone: "quiet" | "soon" | "today" | "overdue";
} | null {
  if (!deadline) return null;
  const due = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) {
    const n = Math.abs(days);
    return { label: `Overdue by ${n} day${n === 1 ? "" : "s"}`, tone: "overdue" };
  }
  if (days === 0) return { label: "Due today", tone: "today" };
  if (days <= 7) return { label: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "soon" };
  return {
    label: `Due ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
    tone: "quiet",
  };
}

/**
 * The deadline chip (phase 48): graduated escalation — plain text far out, a
 * warm tint inside a week, filled on the day, red once overdue. A finished
 * project should simply not render this (a red date on finished work reads as
 * an accusation).
 */
export function DeadlineChip({ deadline, className }: { deadline: string | null; className?: string }) {
  const info = deadlineInfo(deadline);
  if (!info) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-chip px-2 py-px text-micro font-medium",
        info.tone === "quiet" && "text-muted",
        info.tone === "soon" && "bg-warn-soft text-warn-ink",
        info.tone === "today" && "bg-warn text-on-fill font-semibold",
        info.tone === "overdue" && "bg-danger text-on-primary",
        className,
      )}
    >
      <CalendarDays className="h-3 w-3" strokeWidth={2} aria-hidden />
      {info.label}
    </span>
  );
}
