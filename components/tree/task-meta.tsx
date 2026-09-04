"use client";

import { AlertTriangle, FileText, Flag, MessageSquare } from "lucide-react";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";
import { STATUS_STYLE } from "@/lib/status";
import {
  DATE_STATE_STYLE,
  NO_DATE_STYLE,
  PROVISIONAL_RING,
  dateLabel,
  dateState,
  formatDMY,
} from "@/lib/dates";
import type { Priority, Status } from "@/lib/types";

/** Only P0/P1 earn a flag. P2 is the default and P3 is quieter than silence. */
export function PriorityFlag({ priority }: { priority: Priority }) {
  if (priority !== "P0" && priority !== "P1") return null;
  return (
    <span
      className={cn(
        "flex h-7 shrink-0 items-center gap-1 rounded-chip px-2 text-micro font-semibold",
        priority === "P0"
          ? "bg-danger-soft text-danger-ink"
          : "bg-warn-soft text-warn-ink",
      )}
      title={`Priority ${priority}`}
    >
      <Flag className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
      {priority}
    </span>
  );
}

/**
 * "Est. completion" everywhere it is spoken about; the column is still
 * dueDate. Classification lives in lib/dates.ts so the tree, the board, the
 * panel and Focus cannot drift into three different opinions about "late".
 */
export function DuePill({
  due,
  status,
  provisional = false,
}: {
  due: string | null;
  status: Status;
  provisional?: boolean;
}) {
  /* A task with no estimate is not a neutral state — it is work nobody is
     counting. Legacy rows predate the requirement, so they say so rather than
     rendering nothing and quietly disappearing from the schedule.

     Except once it is finished. "Finished work is never late" is already the
     rule for overdue; the same logic says a completed task does not need
     chasing for a date it no longer needs. Struck-through rows were carrying
     a "No date" nag about work that is done. */
  if (!due && (status === "DONE" || status === "CANCELLED")) return null;
  if (!due) {
    return (
      <Tooltip content="No estimated completion date — this task is unscheduled">
        <span
          data-pill="no-date"
          className={cn(
            "flex h-7 shrink-0 items-center rounded-chip px-2.5 text-micro font-semibold",
            NO_DATE_STYLE,
          )}
        >
          No date
        </span>
      </Tooltip>
    );
  }

  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return null;

  const state = dateState(due, status);
  if (state === "none") return null;

  const pill = (
    <span
      className={cn(
        /* font-medium, not semibold. The recipe was already the soft tint —
           what made an overdue pill shout was the weight, sitting next to
           14px regular text as the only coloured thing on the row. It stays
           unmistakably red-family; it just stops being the loudest object on
           the page. */
        "flex h-7 shrink-0 items-center rounded-chip px-2.5 text-micro font-medium tabular-nums",
        DATE_STATE_STYLE[state],
        provisional && PROVISIONAL_RING,
      )}
      title={`Est. completion ${formatDMY(due)}`}
    >
      {dateLabel(due, provisional)}
    </span>
  );

  if (!provisional) return pill;
  return (
    <Tooltip content="Estimated by Orbit — edit the date to confirm it">
      {pill}
    </Tooltip>
  );
}

/** Initials, because a full name in a row of chips is a wall. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AssigneeChip({
  name,
  compact = false,
  hideWhenEmpty = false,
}: {
  name: string | null;
  compact?: boolean;
  /** Tree rows pass this. Sixteen rows each saying "Unassigned" is sixteen
      repetitions of nothing — in a dense row the absence of an avatar already
      carries it. Board cards keep the explicit slot, where "whose is this?" is
      the question the card exists to answer. */
  hideWhenEmpty?: boolean;
}) {
  if (!name) {
    if (hideWhenEmpty) return null;
    /* Dashed, so unassigned reads as an empty slot waiting to be filled
       rather than as a person called Unassigned. */
    return (
      <Tooltip content="Nobody is assigned yet">
        <span className="flex h-7 shrink-0 items-center rounded-chip border border-dashed border-line px-2.5 text-micro text-muted">
          Unassigned
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={name}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-ink",
          compact ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-micro",
        )}
        aria-label={`Assigned to ${name}`}
      >
        {initialsOf(name)}
      </span>
    </Tooltip>
  );
}

/** A child due after its parent. Warns, never blocks — the plan may just be
    mid-edit, and refusing the keystroke would be worse than saying so. */
export function ScheduleWarning({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Tooltip content="Lands after its parent is due — the parent may slip">
      <span className="grid h-7 w-5 shrink-0 place-items-center text-warn-ink">
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
    </Tooltip>
  );
}

/** Shown only for statuses that are not the Backlog default and not Done. */
export function StatusPill({ status }: { status: Status }) {
  if (status === "BACKLOG" || status === "DONE") return null;
  const style = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "flex h-7 shrink-0 items-center rounded-chip border px-2 text-micro font-medium",
        style.pill,
      )}
    >
      {style.label}
    </span>
  );
}

export function TagPills({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex h-7 min-w-0 max-w-[10rem] items-center truncate rounded-chip bg-hover px-2.5 text-micro font-medium text-muted"
        >
          {tag}
        </span>
      ))}
    </>
  );
}

/**
 * Leaf-descendant rollup, the number that must move the instant a child
 * completes. A bare "3/8" told nobody anything, so it carries its basis.
 *
 * Only containers get this. A leaf reports 1/1 the moment it is done, which is
 * arithmetically true and completely uninformative — its checkbox already said
 * so. `hasChildren` decides, not the numbers.
 */
export function ProgressCount({
  done,
  total,
  hasChildren = true,
}: {
  done: number;
  total: number;
  hasChildren?: boolean;
}) {
  if (total === 0 || !hasChildren) return null;
  const pct = Math.round((done / total) * 100);
  const complete = done === total;

  return (
    <Tooltip content={`${done} of ${total} smallest tasks under this one are done — ${pct}%`}>
      <span
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 rounded-chip px-2 text-micro font-semibold tabular-nums",
          complete ? "bg-ok-soft text-ok-ink" : "bg-hover text-muted",
        )}
      >
        {/* A two-tone track rather than a ring: at 12px a ring is a smudge, and
            this has to stay legible four levels deep on a 390px screen. */}
        <span
          className="hidden h-1.5 w-8 overflow-hidden rounded-chip bg-line sm:block"
          aria-hidden
        >
          <span
            className={cn("block h-full", complete ? "bg-ok" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </span>
        {pct}%
      </span>
    </Tooltip>
  );
}

/**
 * A description and a notes thread are invisible from a row otherwise, so a
 * task can quietly hold the context somebody needs. These say "there is more
 * inside" without spending a chip on it.
 */
export function ContentHints({
  hasDescription,
  noteCount,
  onOpen,
}: {
  hasDescription: boolean;
  noteCount: number;
  onOpen?: () => void;
}) {
  if (!hasDescription && noteCount === 0) return null;

  return (
    <span className="flex shrink-0 items-center gap-1.5 text-muted">
      {hasDescription ? (
        <Tooltip content="Has a description">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.();
            }}
            aria-label="Has a description — open details"
            className="press grid h-6 w-6 place-items-center rounded-chip hover:text-ink"
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </Tooltip>
      ) : null}

      {noteCount > 0 ? (
        <Tooltip content={`${noteCount} ${noteCount === 1 ? "note" : "notes"}`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.();
            }}
            aria-label={`${noteCount} notes — open details`}
            className="press flex h-6 items-center gap-1 rounded-chip px-1 hover:text-ink"
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            <span className="text-micro tabular-nums">{noteCount}</span>
          </button>
        </Tooltip>
      ) : null}
    </span>
  );
}

/** A blocked descendant bubbles a red dot up the ancestor chain. */
export function BlockedDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Tooltip content="Something inside this is blocked">
      <span
        className="block h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
        aria-label="Contains blocked work"
      />
    </Tooltip>
  );
}
