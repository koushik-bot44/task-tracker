"use client";

import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useCollapse } from "@/lib/hooks/use-collapse";
import { useEditMode } from "@/lib/hooks/use-edit-mode";
import { useMe } from "@/lib/hooks/use-users";
import { isManagerRole } from "@/lib/roles";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { newTaskId, useTaskMutations, useTasks } from "@/lib/hooks/use-tasks";
import { keyAfter, keyAtEnd, keyBetweenSiblings, keyForNudge } from "@/lib/order";
import { getProjection } from "@/lib/projection";
import { groupTintBg } from "@/lib/group-tints";
import { AUTO_DATE_DAYS, isoDaysFromNow } from "@/lib/dates";
import {
  buildTree,
  descendantIds,
  flattenTree,
  isBlankStub,
  siblingsOf,
  type FlatRow,
} from "@/lib/tree";
import { TaskTitle } from "@/components/task-title";
import { useToast } from "@/components/toast";
import { FirstRunHint } from "@/components/first-run-hint";
import type { ProjectDTO, Status, TaskDTO } from "@/lib/types";
import { INDENT_WIDTH, TaskRow } from "./task-row";
import { DescriptionField } from "./description-field";

/**
 * Everything the tree renders from, so ONE outliner serves both a project tool
 * and a personal label (phase 15) without a fork. A project wrapper builds this
 * from the project hooks; My Space builds it from the private hooks. The tree
 * body (TreeCore) never touches a project or a data hook directly.
 */
export type TreeSource = {
  /** Stable id for effects/keys — a project id, or `label:<id>` / "private". */
  id: string;
  /** The label shown at the head of the zoom trail. */
  rootName: string;
  tasks: TaskDTO[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  canEdit: boolean;
  /** Project roots must be dated; a personal task may be dateless. */
  requireDates: boolean;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  setCollapsedFor: (id: string, collapsed: boolean) => void;
  /** Personal label sections stack many trees, so they drop the per-tree chrome
      (first-run hint, big New-task button, keyboard legend) — the inline Add
      task at the foot is enough. Undefined/false keeps the full project chrome. */
  compact?: boolean;
  /** Phase 33 — My Space's private tree. The task is SIMPLE: only title, status
      and notes. Every project-only meta chip (priority, dates, schedule warning,
      assignee, gates/verified, tags) is hidden on the row. */
  personal?: boolean;
} & ReturnType<typeof useTaskMutations>;

/** Project-tool tree: builds a source from the project hooks (unchanged behaviour). */
export function TreeView({
  project,
  rootId = null,
}: {
  project: ProjectDTO;
  /** When set, this task is the page root and only its subtree renders. */
  rootId?: string | null;
}) {
  /* Read-only rail. A manager lands on a tool's tree to read it; every
     mutating affordance is withheld until they say Edit. Not a permission —
     the server still accepts their writes — a guard against the stray click. */
  const { canEdit } = useEditMode(project.slug);
  const query = useTasks(project.id);
  const mutations = useTaskMutations({
    kind: "project",
    projectId: project.id,
    gateTemplate: project.gateTemplate,
  });
  const collapse = useCollapse(project.id);

  return (
    <TreeCore
      rootId={rootId}
      source={{
        id: project.id,
        rootName: project.name,
        tasks: query.data ?? [],
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: () => void query.refetch(),
        canEdit,
        requireDates: true,
        collapsed: collapse.collapsed,
        toggleCollapse: collapse.toggle,
        setCollapsedFor: collapse.setFor,
        ...mutations,
      }}
    />
  );
}

export function TreeCore({
  source,
  rootId = null,
}: {
  source: TreeSource;
  rootId?: string | null;
}) {
  const reduce = useReducedMotion();
  const { canEdit, isLoading, isError, refetch, requireDates } = source;
  const { createTask, updateTask, deleteTask, restoreTask } = source;
  const { collapsed, toggleCollapse, setCollapsedFor } = source;
  const { show: toast, dismissAll } = useToast();
  const { openTask, zoomTo } = usePanelParams();
  /* Phase 20: a manager's rows show only their Verified sign-off, not the
     team's build-gate cluster. Read the role once here, not per row. */
  const { data: me } = useMe();
  const isManager = isManagerRole(me?.role);
  const tasks = useMemo(() => source.tasks, [source.tasks]);

  // Toast handlers fire long after their closure was built, so they read the
  // task list through a ref rather than a captured snapshot.
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // A prompt about the previous tool/label is noise once you have switched away.
  useEffect(() => dismissAll, [source.id, dismissAll]);

  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [pendingFocus, setPendingFocus] = useState<
    { id: string; select: boolean } | null
  >(null);

  // Phase 24 (My Space): which row's inline free-form "Prompt" box is open, and
  // the commit that writes it to the task's description. Only reachable in
  // compact mode, so project trees never render it.
  const [promptOpenId, setPromptOpenId] = useState<string | null>(null);
  const commitDescription = useCallback(
    (id: string, descriptionMd: string) => updateTask.mutate({ id, patch: { descriptionMd }, quiet: true }),
    [updateTask],
  );

  const registerInput = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(id, el);
    else inputs.current.delete(id);
  }, []);

  // Zooming does not change the data, only which slice of the tree is on screen.
  const roots = useMemo(() => {
    const full = buildTree(tasks);
    if (!rootId) return full;
    const find = (nodes: typeof full): (typeof full)[number] | null => {
      for (const node of nodes) {
        if (node.task.id === rootId) return node;
        const hit = find(node.children);
        if (hit) return hit;
      }
      return null;
    };
    return find(full)?.children ?? [];
  }, [tasks, rootId]);

  const rows = useMemo(() => flattenTree(roots, collapsed), [roots, collapsed]);

  /**
   * The group-tint band for a row (phase 15): walk from the row up its ancestors
   * and take the FIRST task that both carries a groupColor and actually has
   * children — so a band only appears for a real group, and an inner group's own
   * colour overrides its parent's within its subtree (self is checked first).
   */
  const bandColorFor = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const hasChildren = new Set<string>();
    for (const t of tasks) if (t.parentId) hasChildren.add(t.parentId);
    return (taskId: string): string | null => {
      let cursor = byId.get(taskId);
      while (cursor) {
        if (cursor.groupColor && hasChildren.has(cursor.id)) {
          return groupTintBg(cursor.groupColor);
        }
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return null;
    };
  }, [tasks]);

  /** The rooted task and every ancestor above it, tool root first. */
  const trail = useMemo(() => {
    if (!rootId) return [];
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const out: TaskDTO[] = [];
    let cursor = byId.get(rootId);
    while (cursor) {
      out.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return out;
  }, [tasks, rootId]);

  // Focus lands after the row that needs it has actually rendered, which is why
  // this waits on `rows` rather than firing inside the mutation callback.
  useEffect(() => {
    if (!pendingFocus) return;
    const el = inputs.current.get(pendingFocus.id);
    if (!el) return;
    el.focus();
    if (pendingFocus.select) {
      el.select();
    } else {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
    setPendingFocus(null);
  }, [pendingFocus, rows]);

  const focusRow = useCallback((id: string, select = false) => {
    setPendingFocus({ id, select });
  }, []);

  // ── Drag state ────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  /* The sensor list must be CONSTANT. Conditionally spreading it —
     `useSensors(...(canEdit ? [s] : []))` — changes the number of hooks
     useSensors runs when the mode flips, which React reports as "the final
     argument changed size between renders" and which corrupts hook state.
     Dragging is disabled per row instead, via useSortable({ disabled }). */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // A row can never be dropped inside itself, so its subtree leaves the list
  // for the duration of the drag.
  const dragRows = useMemo(() => {
    if (!activeId) return rows;
    const hidden = new Set(descendantIds(tasks, activeId));
    return rows.filter((r) => !hidden.has(r.task.id));
  }, [rows, activeId, tasks]);

  const projection = useMemo(() => {
    if (!activeId || !overId) return null;
    return getProjection(dragRows, activeId, overId, offsetX, INDENT_WIDTH);
  }, [activeId, overId, offsetX, dragRows]);

  const activeRow = useMemo(
    () => rows.find((r) => r.task.id === activeId) ?? null,
    [rows, activeId],
  );

  const resetDrag = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetX(0);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setActiveId(id);
    setOverId(id);
    setOffsetX(0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const onDragMove = ({ delta, over }: DragMoveEvent) => {
    setOffsetX(delta.x);
    if (over) setOverId(String(over.id));
  };

  const onDragOver = ({ over }: DragOverEvent) => {
    setOverId(over ? String(over.id) : null);
  };

  const onDragEnd = ({ active }: DragEndEvent) => {
    const id = String(active.id);
    const landing = projection;
    resetDrag();
    if (!landing) return;

    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const orderKey = keyBetweenSiblings(landing.prevSibling, landing.nextSibling);
    if (task.parentId === landing.parentId && task.orderKey === orderKey) return;

    if (landing.parentId) setCollapsedFor(landing.parentId, false);
    updateTask.mutate({ id, patch: { parentId: landing.parentId, orderKey } });
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * Every task now carries an estimated completion, and Enter cannot stop to
   * ask for one without destroying the outline flow. So it guesses in the
   * order a person would: the sibling you just wrote lands around the same
   * time; failing that, the parent's date; failing that, a week out.
   *
   * The last case is a placeholder rather than a claim — it is rendered amber
   * until a human touches it, so "next Tuesday because the tracker said so"
   * never quietly becomes the plan.
   */
  const dateForNewTask = useCallback(
    (
      parentId: string | null,
      afterId: string | null,
    ): { dueDate: string; dueProvisional: boolean } => {
      /* Copying a neighbour's date inherits its confidence too. A date lifted
         from a sibling somebody actually chose is as good as chosen; one
         lifted from another guess is still a guess. */
      if (afterId) {
        const sibling = tasks.find((t) => t.id === afterId);
        if (sibling?.dueDate) {
          return { dueDate: sibling.dueDate, dueProvisional: sibling.dueProvisional };
        }
      }
      const siblings = tasks.filter((t) => t.parentId === parentId && t.dueDate);
      if (siblings.length > 0) {
        const last = siblings[siblings.length - 1];
        if (last.dueDate) {
          return { dueDate: last.dueDate, dueProvisional: last.dueProvisional };
        }
      }
      if (parentId) {
        const parent = tasks.find((t) => t.id === parentId);
        if (parent?.dueDate) {
          return { dueDate: parent.dueDate, dueProvisional: parent.dueProvisional };
        }
      }
      // Nothing to copy: a week out, and plainly marked as invented.
      return { dueDate: isoDaysFromNow(AUTO_DATE_DAYS), dueProvisional: true };
    },
    [tasks],
  );

  const addTask = useCallback(
    (parentId: string | null, afterId: string | null) => {
      const id = newTaskId();
      const orderKey =
        afterId === null
          ? keyAtEnd(tasks, parentId)
          : keyAfter(tasks, parentId, afterId);
      createTask.mutate({
        id,
        parentId,
        orderKey,
        // A project root must be dated; a personal task may stay dateless.
        ...(requireDates ? dateForNewTask(parentId, afterId) : {}),
      });
      if (parentId) setCollapsedFor(parentId, false);
      focusRow(id);
    },
    [tasks, createTask, focusRow, setCollapsedFor, dateForNewTask, requireDates],
  );

  // applyStatus and the prompt call each other; a ref breaks the cycle without
  // making either of them stale.
  const applyStatusRef = useRef<(id: string, status: Status) => void>(() => {});

  /**
   * Offer to close the parent once every sibling that still counts is done.
   * Cancelled siblings do not hold a parent open; a parent that is already
   * DONE or CANCELLED is never nagged about.
   */
  const promptParentIfComplete = useCallback(
    (childId: string, projected: TaskDTO[]) => {
      const child = projected.find((t) => t.id === childId);
      if (!child?.parentId) return;

      const parent = projected.find((t) => t.id === child.parentId);
      if (!parent) return;
      if (parent.status === "DONE" || parent.status === "CANCELLED") return;

      const siblings = projected.filter(
        (t) => t.parentId === parent.id && t.status !== "CANCELLED",
      );
      if (siblings.length === 0) return;
      if (!siblings.every((s) => s.status === "DONE")) return;

      toast({
        message: `All subtasks done — mark "${parent.title || "Untitled"}" done?`,
        action: {
          label: "Mark done",
          onAction: () => applyStatusRef.current(parent.id, "DONE"),
        },
        secondary: { label: "Keep open", onAction: () => {} },
      });
    },
    [toast],
  );

  const applyStatus = useCallback(
    (taskId: string, status: Status) => {
      updateTask.mutate({ id: taskId, patch: { status } });
      if (status !== "DONE") return;
      // onMutate lands asynchronously, so project the change rather than
      // reading the cache back and racing it.
      const projected = tasksRef.current.map((t) =>
        t.id === taskId ? { ...t, status } : t,
      );
      promptParentIfComplete(taskId, projected);
    },
    [updateTask, promptParentIfComplete],
  );

  useEffect(() => {
    applyStatusRef.current = applyStatus;
  }, [applyStatus]);

  const setStatus = useCallback(
    (row: FlatRow, status: Status) => applyStatus(row.task.id, status),
    [applyStatus],
  );

  const toggleDone = useCallback(
    (row: FlatRow) => {
      applyStatus(row.task.id, row.task.status === "DONE" ? "BACKLOG" : "DONE");
    },
    [applyStatus],
  );

  const changeTitle = useCallback(
    (id: string, title: string) => {
      updateTask.mutate({ id, patch: { title }, quiet: true });
    },
    [updateTask],
  );

  /* Silent on purpose. The row was never anything, so announcing its removal
     would be telling the user about a task they never made — and offering Undo
     on an empty row is offering to restore nothing. Deliberate deletes still
     toast; this is the one path that does not. */
  const discardBlank = useCallback(
    (row: FlatRow) => {
      if (!isBlankStub(row.task, tasks)) return;
      deleteTask.mutate({ id: row.task.id, removed: [row.task] });
    },
    [tasks, deleteTask],
  );

  const removeTask = useCallback(
    (row: FlatRow) => {
      const id = row.task.id;
      const doomed = new Set([id, ...descendantIds(tasks, id)]);
      const removed = tasks.filter((t) => doomed.has(t.id));

      // Move focus to the nearest row that is not itself about to vanish.
      const index = rows.findIndex((r) => r.task.id === id);
      const neighbour =
        rows.slice(index + 1).find((r) => !doomed.has(r.task.id)) ??
        rows
          .slice(0, index)
          .reverse()
          .find((r) => !doomed.has(r.task.id));

      deleteTask.mutate({ id, removed });

      const extra = removed.length - 1;
      toast({
        message:
          extra > 0
            ? `Deleted "${row.task.title || "Untitled"}" and ${extra} subtask${extra === 1 ? "" : "s"}`
            : `Deleted "${row.task.title || "Untitled"}"`,
        action: {
          label: "Undo",
          onAction: () => {
            restoreTask.mutate({ id, rows: removed });
            focusRow(id);
          },
        },
      });

      if (neighbour) focusRow(neighbour.task.id);
    },
    [tasks, rows, deleteTask, restoreTask, toast, focusRow],
  );

  const indent = useCallback(
    (row: FlatRow) => {
      const siblings = siblingsOf(tasks, row.task.parentId);
      const index = siblings.findIndex((s) => s.id === row.task.id);
      if (index <= 0) return;
      const newParent = siblings[index - 1];
      const orderKey = keyAtEnd(tasks, newParent.id);
      setCollapsedFor(newParent.id, false);
      updateTask.mutate({
        id: row.task.id,
        patch: { parentId: newParent.id, orderKey },
      });
      focusRow(row.task.id);
    },
    [tasks, updateTask, setCollapsedFor, focusRow],
  );

  const outdent = useCallback(
    (row: FlatRow) => {
      // Outdenting past the zoom root would move the task out of the view it
      // was edited in, which reads as the row vanishing.
      if (rootId && row.task.parentId === rootId) return;
      const parent = tasks.find((t) => t.id === row.task.parentId);
      if (!parent) return;
      const orderKey = keyAfter(tasks, parent.parentId, parent.id);
      updateTask.mutate({
        id: row.task.id,
        patch: { parentId: parent.parentId, orderKey },
      });
      focusRow(row.task.id);
    },
    [tasks, updateTask, focusRow, rootId],
  );

  const togglePin = useCallback(
    (row: FlatRow) => {
      updateTask.mutate({
        id: row.task.id,
        patch: { pinnedAt: row.task.pinnedAt ? null : new Date().toISOString() },
      });
    },
    [updateTask],
  );

  const nudge = useCallback(
    (row: FlatRow, direction: "up" | "down") => {
      const orderKey = keyForNudge(tasks, row.task, direction);
      if (!orderKey) return;
      updateTask.mutate({ id: row.task.id, patch: { orderKey } });
      focusRow(row.task.id);
    },
    [tasks, updateTask, focusRow],
  );

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, row: FlatRow) => {
      const el = event.currentTarget;
      const mod = event.metaKey || event.ctrlKey;
      const index = rows.findIndex((r) => r.task.id === row.task.id);

      if (event.key === "Enter" && mod) {
        event.preventDefault();
        toggleDone(row);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        // A new sibling below, always — predictable beats clever.
        addTask(row.task.parentId, row.task.id);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        if (event.shiftKey) outdent(row);
        else indent(row);
        return;
      }

      if (event.key === "Escape") {
        el.blur();
        return;
      }

      if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        nudge(row, event.key === "ArrowUp" ? "up" : "down");
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const next = rows[event.key === "ArrowUp" ? index - 1 : index + 1];
        if (next) {
          event.preventDefault();
          focusRow(next.task.id);
        }
        return;
      }

      // Left/Right only steal the key when the caret is already at the edge,
      // so ordinary text editing still works.
      if (event.key === "ArrowLeft") {
        const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
        if (!atStart) return;
        if (row.hasChildren && !collapsed.has(row.task.id)) {
          event.preventDefault();
          setCollapsedFor(row.task.id, true);
        } else if (row.task.parentId) {
          event.preventDefault();
          focusRow(row.task.parentId);
        }
        return;
      }

      if (event.key === "ArrowRight") {
        const atEnd =
          el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
        if (!atEnd || !row.hasChildren) return;
        if (collapsed.has(row.task.id)) {
          event.preventDefault();
          setCollapsedFor(row.task.id, false);
        } else {
          const next = rows[index + 1];
          if (next) {
            event.preventDefault();
            focusRow(next.task.id);
          }
        }
        return;
      }

      // Backspace on an empty leaf removes it — the outliner's undo of Enter.
      if (event.key === "Backspace" && el.value === "" && !row.hasChildren) {
        if (rows.length <= 1) return;
        event.preventDefault();
        removeTask(row);
      }
    },
    [
      rows,
      collapsed,
      addTask,
      toggleDone,
      indent,
      outdent,
      nudge,
      focusRow,
      setCollapsedFor,
      removeTask,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) return <TreeSkeleton />;

  if (isError) {
    return (
      <div className="px-4 py-16 text-center sm:px-8">
        <p className="text-sm text-muted">Could not load tasks.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-lg border border-line px-3 py-2 text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {trail.length > 0 ? (
        <nav
          aria-label="Zoom trail"
          className="flex flex-wrap items-center gap-1 px-3 pb-2 pt-1 text-sm sm:px-5"
        >
          <button
            type="button"
            onClick={() => zoomTo(null)}
            className="rounded-md px-1.5 py-1 text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
          >
            {source.rootName}
          </button>
          {trail.map((node, i) => {
            const last = i === trail.length - 1;
            return (
              <span key={node.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 shrink-0 text-muted" aria-hidden />
                {last ? (
                  <span
                    aria-current="page"
                    className="px-1.5 py-1 font-display text-base font-semibold text-ink"
                  >
                    <TaskTitle title={node.title} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => zoomTo(node.id)}
                    className="rounded-md px-1.5 py-1 text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
                  >
                    <TaskTitle title={node.title} />
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      {source.compact ? null : (
        <div className="px-4 sm:px-8">
          <FirstRunHint id="tree">
            Enter adds a task, Tab indents it — or use the + buttons.
          </FirstRunHint>
        </div>
      )}

      {/* Creation used to be keyboard-only or buried at the bottom of a long
          tree. It now has a permanent home at the top, where you look first. */}
      {/* Hidden entirely in read-only, rather than shown disabled: a greyed
          button still invites the click the rail exists to prevent. */}
      {canEdit && !source.compact ? (
      <div className="flex items-center gap-2 px-4 pb-2 sm:px-8">
        <button
          type="button"
          onClick={() => addTask(rootId, null)}
          className="press flex h-10 items-center gap-1.5 rounded-chip bg-primary px-4 text-sm font-semibold text-on-primary shadow-e1 hover:opacity-95"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          New task
        </button>
        <span className="hidden text-micro text-muted sm:inline">
          or press Enter on any task to add one below it
        </span>
      </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={resetDrag}
      >
        <SortableContext
          items={dragRows.map((r) => r.task.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="px-2 sm:px-4">
            <AnimatePresence initial={false}>
              {dragRows.map((row) => (
                <motion.div
                  key={row.task.id}
                  // Framer's layout animation and dnd-kit's transforms both want
                  // to move this element; during a drag, dnd-kit wins outright.
                  layout={reduce || activeId !== null ? false : "position"}
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: reduce ? 0 : 0.17, ease: [0.16, 1, 0.3, 1] }}
                >
                  <TaskRow
                    row={row}
                    band={bandColorFor(row.task.id)}
                    collapsed={collapsed.has(row.task.id)}
                    isDragging={activeId === row.task.id}
                    dropTarget={
                      activeId !== null &&
                      projection?.parentId === row.task.id &&
                      activeId !== row.task.id
                    }
                    onKeyDown={canEdit ? onKeyDown : undefined}
                    readOnly={!canEdit}
                    isManager={isManager}
                    personal={source.personal}
                    onTitleChange={canEdit ? changeTitle : undefined}
                    onToggleDone={canEdit ? toggleDone : undefined}
                    onSetStatus={canEdit ? setStatus : undefined}
                    onToggleCollapse={toggleCollapse}
                    onDelete={canEdit ? removeTask : undefined}
                    onBlurEmpty={canEdit ? discardBlank : undefined}
                    onZoom={zoomTo}
                    onOpenDetail={openTask}
                    onTogglePin={canEdit ? togglePin : undefined}
                    onAddChild={canEdit ? (r) => addTask(r.task.id, null) : undefined}
                    onOpenPrompt={
                      canEdit && source.compact
                        ? (id) => setPromptOpenId((prev) => (prev === id ? null : id))
                        : undefined
                    }
                    promptOpen={promptOpenId === row.task.id}
                    registerInput={registerInput}
                  />
                  {source.compact && promptOpenId === row.task.id ? (
                    <InlinePrompt
                      task={row.task}
                      depth={row.depth}
                      onCommit={commitDescription}
                      onClose={() => setPromptOpenId(null)}
                    />
                  ) : null}
                </motion.div>
              ))}
            </AnimatePresence>

            {rows.length === 0 ? <EmptyState onAdd={() => addTask(rootId, null)} /> : null}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={reduce ? null : undefined}>
          {activeRow ? (
            <div style={{ transform: reduce ? undefined : "rotate(1.2deg)" }}>
              <TaskRow
                row={{ ...activeRow, depth: projection?.depth ?? activeRow.depth }}
                collapsed
                overlay
                isManager={isManager}
                personal={source.personal}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {rows.length > 0 ? (
        <div className="px-2 pt-1 sm:px-4">
          <button
            type="button"
            onClick={() => addTask(rootId, null)}
            className="flex h-10 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Add task
          </button>
        </div>
      ) : null}

      {source.compact ? null : <KeyboardLegend />}
    </div>
  );
}

/**
 * Phase 24: the My Space per-task inline "Prompt" box. Renders the shared
 * DescriptionField under the row, indented to sit beneath the row's content, so
 * a developer can write free-form detail without opening the detail panel. The
 * field commits on blur; "Done" simply closes it.
 */
function InlinePrompt({
  task,
  depth,
  onCommit,
  onClose,
}: {
  task: TaskDTO;
  depth: number;
  onCommit: (id: string, descriptionMd: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden pb-2"
      style={{ paddingLeft: depth * INDENT_WIDTH + 34 }}
    >
      <div className="rounded-lg border border-line bg-bg p-2.5">
        <DescriptionField
          value={task.descriptionMd}
          onCommit={(md) => onCommit(task.id, md)}
          rows={4}
          placeholder="Write anything about this task — Markdown supported"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="press h-7 rounded-card px-2.5 text-micro font-medium text-muted hover:text-ink"
          >
            Done
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-2 py-20 text-center">
      <p className="font-display text-xl text-ink">Nothing here yet</p>
      <p className="mt-1.5 text-sm text-muted">
        Add the first task, then press Enter to keep going.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        New task
      </button>
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div className="space-y-1 px-2 pt-1 sm:px-4" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-10 items-center gap-3" style={{ paddingLeft: (i % 3) * INDENT_WIDTH }}>
          <span className="h-[18px] w-[18px] shrink-0 animate-pulse rounded-full bg-hover" />
          <span
            className="h-3 animate-pulse rounded bg-hover"
            style={{ width: `${38 + ((i * 13) % 34)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

const KEYS: Array<[string, string]> = [
  ["Enter", "new sibling"],
  ["Tab / ⇧Tab", "indent / outdent"],
  ["⌥ ↑↓", "reorder"],
  ["↑↓", "move focus"],
  ["←→", "collapse / expand"],
  ["⌘/Ctrl ↵", "toggle done"],
];

function KeyboardLegend() {
  return (
    <div className="mt-6 hidden flex-wrap items-center gap-x-4 gap-y-1.5 px-4 text-micro text-muted sm:flex">
      {KEYS.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5">
          <kbd className="rounded border border-line px-1.5 py-0.5 font-sans text-micro text-muted">
            {key}
          </kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
