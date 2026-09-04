import type { Status } from "./types";

/**
 * One source of truth for how a status looks and reads, so the board column,
 * the row dot, the status menu and the detail select can never disagree.
 *
 * Chips are soft pastel fills: a ~12-16% tint of the hue, with the darker
 * `-ink` value for text and dot so both clear contrast against that tint.
 */
export type StatusStyle = {
  label: string;
  /** Standalone dot — uses the ink value so a 6px circle survives on white. */
  dot: string;
  /** Pastel chip: tint background, ink text, no border needed. */
  pill: string;
  /** Bare text colour. */
  text: string;
};

export const STATUS_STYLE: Record<Status, StatusStyle> = {
  BACKLOG: {
    label: "To do",
    dot: "bg-muted",
    pill: "bg-hover text-muted",
    text: "text-muted",
  },
  PLANNED: {
    label: "Planned",
    dot: "bg-info-ink",
    pill: "bg-info-soft text-info-ink",
    text: "text-info-ink",
  },
  IN_PROGRESS: {
    label: "In progress",
    dot: "bg-primary",
    pill: "bg-primary-soft text-primary-ink",
    text: "text-primary-ink",
  },
  /* Amber, deliberately not red. On hold is a decision — waiting on a client,
     parked for the quarter — where Blocked is an obstacle someone has to clear.
     Sharing red would let the two blur together, and only Blocked bubbles a
     warning up the tree. */
  ON_HOLD: {
    label: "On hold",
    dot: "bg-warn-ink",
    pill: "bg-warn-soft text-warn-ink",
    text: "text-warn-ink",
  },
  BLOCKED: {
    label: "Stuck",
    dot: "bg-danger-ink",
    pill: "bg-danger-soft text-danger-ink",
    text: "text-danger-ink",
  },
  DONE: {
    label: "Completed",
    dot: "bg-ok-ink",
    pill: "bg-ok-soft text-ok-ink",
    text: "text-ok-ink",
  },
  CANCELLED: {
    label: "Cancelled",
    dot: "bg-muted",
    pill: "bg-hover text-muted",
    text: "text-muted",
  },
};

/**
 * Large-area fill classes — charts and mini-bars.
 *
 * Separate from `dot` on purpose: a dot is a glyph that owes 3:1 against white
 * and therefore uses the -ink value, while a chart wedge is a fill sitting
 * next to other fills. Using the dot colours for wedges made backlog the
 * heaviest thing on every chart.
 */
export const STATUS_FILL: Record<Status, string> = {
  BACKLOG: "bg-chart-idle",
  PLANNED: "bg-info",
  IN_PROGRESS: "bg-primary",
  ON_HOLD: "bg-warn",
  BLOCKED: "bg-danger",
  DONE: "bg-ok",
  CANCELLED: "bg-line",
};

export const statusLabel = (status: Status) => STATUS_STYLE[status].label;

/** Statuses whose work is finished, one way or another. */
export const CLOSED_STATUSES: Status[] = ["DONE", "CANCELLED"];
