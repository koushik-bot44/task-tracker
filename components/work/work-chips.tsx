"use client";

import { Chip, type ChipTone } from "@/components/ui/chip";
import { WORK_PRIORITY_LABEL, WORK_STATE_LABEL, WORK_TYPE_LABEL, type WorkPriority, type WorkState, type WorkType } from "@/lib/types";

/** Each state in the soft-tint chip language. */
export const STATE_TONE: Record<WorkState, ChipTone> = {
  NEW: "neutral",
  ASSIGNED: "info",
  IN_PROGRESS: "primary",
  WAITING: "warn",
  RESOLVED: "ok",
  CLOSED: "ok",
  CANCELLED: "neutral",
  ESCALATED: "danger",
  REOPENED: "warn",
};

export function StateChip({ state, onClick, className }: { state: WorkState; onClick?: () => void; className?: string }) {
  return (
    <Chip tone={STATE_TONE[state]} onClick={onClick} className={className} title={`Status: ${WORK_STATE_LABEL[state]}`}>
      {WORK_STATE_LABEL[state]}
    </Chip>
  );
}

/** Only the loud priorities get a chip; Medium and Low say nothing. */
export function PriorityChip({ priority, className }: { priority: WorkPriority; className?: string }) {
  if (priority === "MEDIUM" || priority === "LOW") return null;
  return (
    <Chip tone={priority === "CRITICAL" ? "danger" : "warn"} className={className} title={`Priority: ${WORK_PRIORITY_LABEL[priority]}`}>
      {WORK_PRIORITY_LABEL[priority]}
    </Chip>
  );
}

export function TypeChip({ type, className }: { type: WorkType; className?: string }) {
  return (
    <Chip tone="neutral" className={className}>
      {WORK_TYPE_LABEL[type]}
    </Chip>
  );
}
