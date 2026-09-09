/**
 * The task lifecycle (work model, 2026-09-09). Pure: no database, no React.
 *
 *   NEW → ASSIGNED → IN_PROGRESS → WAITING → RESOLVED → CLOSED
 *                                 ↘ ESCALATED ↗        ↘ REOPENED ↗
 *
 * This file is the ONLY place that says which move is allowed. The routes
 * and the old screens (which still speak To do / Doing / Stuck / Done) both
 * come here: `pathToStatus` turns a legacy status into the hops that reach it,
 * and `statusOf` is the projection every count and card keeps reading.
 */
import type { TaskStatus, WorkState } from "@/lib/types";

export const TRANSITIONS: Record<WorkState, readonly WorkState[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "NEW", "CANCELLED"],
  // "Put it back" (→ ASSIGNED / NEW) exists so the old status sheet's "To do"
  // still has a meaning; it is recorded like any other move.
  IN_PROGRESS: ["WAITING", "RESOLVED", "ESCALATED", "ASSIGNED", "NEW", "CANCELLED"],
  WAITING: ["IN_PROGRESS", "CANCELLED"],
  ESCALATED: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  CANCELLED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "CANCELLED"],
};

export function canTransition(from: WorkState, to: WorkState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** What the four-status screens show for a state. */
export function statusOf(state: WorkState): TaskStatus {
  switch (state) {
    case "IN_PROGRESS":
    case "ESCALATED":
      return "DOING";
    case "WAITING":
      return "STUCK";
    case "RESOLVED":
    case "CLOSED":
    case "CANCELLED":
      return "DONE";
    default:
      return "TODO";
  }
}

export const OPEN: readonly WorkState[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "ESCALATED", "REOPENED"];
export const FINISHED: readonly WorkState[] = ["RESOLVED", "CLOSED", "CANCELLED"];

export function isFinished(state: WorkState): boolean {
  return FINISHED.includes(state);
}

/** What a move needs besides permission. */
export function transitionNeeds(to: WorkState): { waitingReason?: true; resolution?: true } {
  if (to === "WAITING") return { waitingReason: true };
  if (to === "RESOLVED") return { resolution: true };
  return {};
}

/**
 * The hops that take `from` to a state reading as `status` on the old
 * screens. Empty when it already does. Each hop is validated and recorded
 * separately, so a "Done" tick from To do shows as started, then resolved.
 */
export function pathToStatus(from: WorkState, status: TaskStatus, hasAssignee: boolean): WorkState[] {
  if (statusOf(from) === status) return [];
  const finished = isFinished(from);
  const queue: WorkState = hasAssignee ? "ASSIGNED" : "NEW";
  switch (status) {
    case "DONE":
      if (from === "IN_PROGRESS" || from === "ESCALATED") return ["RESOLVED"];
      return ["IN_PROGRESS", "RESOLVED"];
    case "DOING":
      return finished ? ["REOPENED", "IN_PROGRESS"] : ["IN_PROGRESS"];
    case "STUCK":
      if (from === "IN_PROGRESS" || from === "ESCALATED") return ["WAITING"];
      return finished ? ["REOPENED", "IN_PROGRESS", "WAITING"] : ["IN_PROGRESS", "WAITING"];
    case "TODO":
      if (finished) return ["REOPENED"];
      if (from === "IN_PROGRESS") return [queue];
      // WAITING / ESCALATED go through IN_PROGRESS on their way back.
      return ["IN_PROGRESS", queue];
  }
}

/** NEW ↔ ASSIGNED follow the holder; every other state keeps its place. */
export function stateAfterAssignment(state: WorkState, hasAssignee: boolean): WorkState {
  if (state === "NEW" && hasAssignee) return "ASSIGNED";
  if (state === "ASSIGNED" && !hasAssignee) return "NEW";
  return state;
}

/** The plain words a move is shown with. */
export const TRANSITION_LABEL: Record<WorkState, string> = {
  NEW: "Put back",
  ASSIGNED: "Put back",
  IN_PROGRESS: "Start",
  WAITING: "Waiting…",
  RESOLVED: "Resolve",
  CLOSED: "Close",
  CANCELLED: "Cancel",
  ESCALATED: "Escalate",
  REOPENED: "Reopen",
};
