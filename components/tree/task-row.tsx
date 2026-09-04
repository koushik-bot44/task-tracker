"use client";

import { useSortable } from "@dnd-kit/sortable";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronRight,
  GripVertical,
  MessageSquarePlus,
  PanelRight,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import { Tooltip } from "@/components/tooltip";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { dateState } from "@/lib/dates";
import type { FlatRow } from "@/lib/tree";
import type { Status } from "@/lib/types";
import { VerifiedChip } from "./gate-chips";
import { StatusCheckbox } from "./status-checkbox";
import { StatusMenu } from "./status-menu";
import { StatusPill } from "./task-meta";

export const INDENT_WIDTH = 24;
const TITLE_DEBOUNCE_MS = 400;

export type TaskRowProps = {
  row: FlatRow;
  collapsed: boolean;
  /** Depth the drag would land at, when this row is the one being dragged. */
  projectedDepth?: number;
  isDragging?: boolean;
  /** Rendered inside DragOverlay — no sortable wiring, no interactivity. */
  overlay?: boolean;
  /** This row would become the drop's new parent — glow it. */
  dropTarget?: boolean;
  /** Manager read-only rail: show everything, offer nothing that mutates. */
  readOnly?: boolean;
  /** Phase 20: a manager's row hides the team's build gates and shows only
      their own Verified sign-off indicator in the cluster's place. */
  isManager?: boolean;
  /** Phase 33: My Space's private row is SIMPLE — only status + notes; every
      project-only chip (priority, dates, schedule, assignee, gates, tags) is
      hidden, and the notes affordance reads "Notes" rather than "Prompt". */
  personal?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>, row: FlatRow) => void;
  onTitleChange?: (id: string, title: string) => void;
  onToggleDone?: (row: FlatRow) => void;
  onSetStatus?: (row: FlatRow, status: Status) => void;
  onToggleCollapse?: (id: string) => void;
  onDelete?: (row: FlatRow) => void;
  /** Blur left the title empty; the parent decides whether to discard. */
  onBlurEmpty?: (row: FlatRow) => void;
  onZoom?: (id: string) => void;
  onAddChild?: (row: FlatRow) => void;
  onOpenDetail?: (id: string) => void;
  onTogglePin?: (row: FlatRow) => void;
  /** Phase 24 (My Space only): toggle the inline free-form "Prompt" description
      box under this row. Undefined outside compact mode, so no pill appears. */
  onOpenPrompt?: (id: string) => void;
  /** Whether this row's inline Prompt box is currently open. */
  promptOpen?: boolean;
  registerInput?: (id: string, el: HTMLInputElement | null) => void;
  /** Phase 15: the group-tint band colour behind this row, or null for none.
      Consecutive rows sharing a colour read as one banded group. */
  band?: string | null;
};

export function TaskRow({
  row,
  collapsed,
  projectedDepth,
  isDragging = false,
  overlay = false,
  dropTarget = false,
  readOnly = false,
  isManager = false,
  personal = false,
  band = null,
  onKeyDown,
  onTitleChange,
  onToggleDone,
  onSetStatus,
  onToggleCollapse,
  onDelete,
  onBlurEmpty,
  onZoom,
  onAddChild,
  onOpenDetail,
  onTogglePin,
  onOpenPrompt,
  promptOpen = false,
  registerInput,
}: TaskRowProps) {
  const { task } = row;
  const reduce = useReducedMotion();
  const done = task.status === "DONE";
  const cancelled = task.status === "CANCELLED";
  const dimmed = done || cancelled;
  // The one metadata hint the calm row keeps: overdue. Not the whole date pill —
  // just a small dot, so late work still catches the eye. Everything else (the
  // date, priority, gates, progress, tags…) now lives in the detail panel.
  const overdue = !personal && dateState(task.dueDate, task.status) === "overdue";

  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(task.title);

  // The server is the source of truth, but never yank text out from under a
  // cursor that is mid-word.
  useEffect(() => {
    if (!focused) setDraft(task.title);
  }, [task.title, focused]);

  useEffect(() => {
    if (overlay) return;
    registerInput?.(task.id, inputRef.current);
    return () => registerInput?.(task.id, null);
  }, [overlay, registerInput, task.id]);

  const flush = useCallback(
    (value: string) => {
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      if (value !== task.title) onTitleChange?.(task.id, value);
    },
    [onTitleChange, task.id, task.title],
  );

  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, []);

  // `disabled`, never conditional hook usage: under the read-only rail the row
  // must not lift or follow the cursor, but the hook still has to run.
  const sortable = useSortable({ id: task.id, disabled: overlay || readOnly });
  const depth = projectedDepth ?? row.depth;

  // Translate only — a scaled row would blur its own text mid-drag. The group
  // band (phase 15) is an inline background so the whole subtree shares one tint;
  // rows without a band keep the class-based hover surface.
  const style = overlay
    ? undefined
    : {
        transform: sortable.transform
          ? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
          : undefined,
        transition: sortable.transition,
        backgroundColor: band ?? undefined,
      };

  return (
    <div
      ref={overlay ? undefined : sortable.setNodeRef}
      style={style}
      data-task-id={task.id}
      className={cn(
        "group relative flex items-center rounded-card py-0.5 transition-shadow duration-150 ease-out",
        !overlay && "hover:bg-surface hover:shadow-e1",
        isDragging && "opacity-35",
        dropTarget && "shadow-drop",
        overlay && "w-full bg-surface shadow-lift ring-2 ring-primary",
      )}
    >
      {/* Depth guides — one soft rail per ancestor level; the innermost adds an
          elbow tick so a child visibly hangs off its parent. self-stretch keeps
          the rails continuous down the tree as rows breathe vertically. */}
      {Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("guide-line relative shrink-0 self-stretch", i === depth - 1 && "guide-elbow")}
          style={{ width: INDENT_WIDTH }}
        />
      ))}

      {/* Chevron slot is always reserved so titles line up whether or not a
          row has children. */}
      <div className="grid h-10 w-6 shrink-0 place-items-center">
        {row.hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.(task.id);
            }}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand" : "Collapse"}
            className="hit-40 grid h-6 w-6 place-items-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
          >
            <motion.span
              initial={false}
              animate={{ rotate: collapsed ? 0 : 90 }}
              transition={{ duration: reduce ? 0 : 0.17, ease: [0.16, 1, 0.3, 1] }}
              className="grid place-items-center"
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </motion.span>
          </button>
        ) : null}
      </div>

      {/* The bullet zooms, Workflowy-style: the task becomes the page root. */}
      <div className="grid h-10 w-5 shrink-0 place-items-center">
        <Tooltip content="Zoom in — make this task the page">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onZoom?.(task.id);
          }}
          disabled={overlay}
          aria-label={`Zoom into ${task.title || "Untitled"}`}
          className="hit-40 press grid h-5 w-5 place-items-center rounded-full"
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors duration-150 ease-out",
              row.hasChildren && collapsed && "ring-[3px] ring-line",
              dimmed ? "bg-line" : "bg-muted",
            )}
          />
        </button>
        </Tooltip>
      </div>

      {/* In read-only the checkbox becomes a status indicator: same glyph,
          no button, nothing to press by accident. */}
      <StatusCheckbox
        status={task.status}
        readOnly={readOnly}
        onToggle={readOnly ? undefined : () => onToggleDone?.(row)}
      />

      {/* Title + ONE status. The name gets the room (identity line); a single
          status sits at the right. Every other signal (priority, date, gates,
          progress, tags, links, notes) now lives in the detail panel. */}
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-1">
        <div
          className="relative flex min-h-10 min-w-0 flex-1 items-center cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {/* A done task reads as done by DIMMING to muted (phase 15) — no
              strike-through; only the colour fades. */}
          <input
            ref={inputRef}
            value={draft}
            disabled={overlay || readOnly}
            readOnly={readOnly}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              if (flushTimer.current) clearTimeout(flushTimer.current);
              flushTimer.current = setTimeout(() => onTitleChange?.(task.id, next), TITLE_DEBOUNCE_MS);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              flush(draft);
              /* Enter mints a row immediately, so walking away leaves a blank one
                 behind; report it and let the parent judge. */
              if (draft.trim() === "") onBlurEmpty?.(row);
            }}
            onKeyDown={(e) => onKeyDown?.(e, row)}
            placeholder="Untitled"
            aria-label="Task title"
            spellCheck={false}
            size={1}
            className={cn(
              "w-full min-w-0 truncate rounded-chip bg-transparent text-row outline-none",
              "placeholder:italic placeholder:text-muted",
              "[transition:color_180ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              // A parent reads a touch heavier than a leaf subtask, so the
              // hierarchy is legible even before you scan the indent.
              row.hasChildren && !dimmed && "font-medium",
              dimmed ? "text-muted" : "text-ink",
            )}
          />
        </div>

        {/* Calm meta: a subtle overdue hint + exactly ONE status. For a manager
            that one status is their Verified sign-off (phase 20); for everyone
            else it is the work-status pill (Backlog/Done show none — the checkbox
            already carries done-ness). */}
        <div className="flex shrink-0 items-center gap-1.5">
          {overdue ? (
            <Tooltip content="Overdue — past its estimated completion date">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-label="Overdue" />
            </Tooltip>
          ) : null}
          {isManager ? <VerifiedChip gates={task.gates} /> : <StatusPill status={task.status} />}
          {/* My Space keeps its always-visible Notes affordance — its inline way
              to write free-form detail. */}
          {onOpenPrompt ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenPrompt(task.id);
              }}
              aria-expanded={promptOpen}
              aria-label={
                task.hasDescription
                  ? personal ? "Edit this task's notes" : "Edit this task's prompt"
                  : personal ? "Add notes" : "Add a prompt"
              }
              className={cn(
                "press inline-flex h-6 shrink-0 items-center gap-1 rounded-chip px-2 text-micro font-medium transition-colors duration-150 ease-out",
                task.hasDescription || promptOpen
                  ? "bg-primary-soft text-primary-ink"
                  : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {personal ? "Notes" : "Prompt"}
            </button>
          ) : null}
          {/* Mobile has no hover toolbar, so every row keeps one calm, always-
              visible way into the full detail (where every other field now
              lives). Desktop uses the hover toolbar's Open-details instead. */}
          {!overlay && onOpenDetail ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(task.id);
              }}
              aria-label="Open details"
              className="press grid h-9 w-9 shrink-0 place-items-center rounded-card text-muted hover:text-ink sm:hidden"
            >
              <PanelRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {/* Quick actions — revealed on hover, and on keyboard focus so they are
          not mouse-only. */}
      {!overlay ? (
        // opacity-0 still reserves layout width — roughly 184px, which at
        // 390px was eating half the row and truncating every title. Hidden
        // outright on small screens, where the detail panel does this job.
        <div
          className={cn(
            "hidden shrink-0 items-center opacity-0 transition-opacity duration-150 ease-out focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100",
            readOnly ? "sm:hidden" : "sm:flex",
          )}
        >
          <Tooltip content="Add a subtask">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild?.(row);
              }}
              aria-label="Add a subtask"
              className="press grid h-10 w-9 place-items-center rounded-card text-muted hover:text-ink"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip content={task.pinnedAt ? "Remove from Focus" : "Pin to Focus"}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin?.(row);
            }}
            aria-pressed={task.pinnedAt !== null}
            aria-label={task.pinnedAt ? "Remove from Focus" : "Pin to Focus"}
            className={cn(
              "press grid h-10 w-9 place-items-center rounded-card",
              task.pinnedAt ? "text-warn-ink" : "text-muted hover:text-ink",
            )}
          >
            <Pin
              className="h-4 w-4"
              strokeWidth={1.75}
              fill={task.pinnedAt ? "currentColor" : "none"}
              aria-hidden
            />
          </button>
          </Tooltip>
          <Tooltip content="Open details, notes and gates">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail?.(task.id);
            }}
            aria-label="Open details, notes and gates"
            className="press grid h-10 w-9 place-items-center rounded-card text-muted hover:text-ink"
          >
            <PanelRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          </Tooltip>
          <StatusMenu
            status={task.status}
            onSelect={(next) => onSetStatus?.(row, next)}
          />
          <Tooltip content="Delete — you get ten seconds to undo">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(row);
            }}
            aria-label="Delete task"
            className="press grid h-10 w-10 place-items-center rounded-card text-muted hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          </Tooltip>
          <Tooltip content="Drag to reorder, or sideways to change its parent">
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label="Drag to reorder or move this task"
            data-no-press
            className="grid h-10 w-8 cursor-grab touch-none place-items-center rounded-card text-muted transition-colors duration-150 ease-out hover:text-ink active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}
