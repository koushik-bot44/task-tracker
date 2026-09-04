import type { TaskStatus } from "./types";

/**
 * One source of truth for how a status looks and reads (restructure: four).
 * Soft tint chip + darker ink text; both clear 4.5:1 (scripts/contrast.ts).
 */
export type StatusStyle = { label: string; dot: string; pill: string; text: string };

export const STATUS_STYLE: Record<TaskStatus, StatusStyle> = {
  TODO: { label: "To do", dot: "bg-muted", pill: "bg-hover text-muted", text: "text-muted" },
  DOING: { label: "Doing", dot: "bg-primary", pill: "bg-primary-soft text-primary-ink", text: "text-primary-ink" },
  STUCK: { label: "Stuck", dot: "bg-danger-ink", pill: "bg-danger-soft text-danger-ink", text: "text-danger-ink" },
  DONE: { label: "Done", dot: "bg-ok-ink", pill: "bg-ok-soft text-ok-ink", text: "text-ok-ink" },
};

export const statusLabel = (status: TaskStatus) => STATUS_STYLE[status].label;

/** Statuses whose work is finished. */
export const CLOSED_STATUSES: TaskStatus[] = ["DONE"];
