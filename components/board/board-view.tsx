"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { TaskTitle } from "@/components/task-title";
import { cn } from "@/lib/cn";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjectBySlug } from "@/lib/hooks/use-projects";
import { newTaskId, useTaskMutations, useTasks } from "@/lib/hooks/use-tasks";
import type { Status, TaskDTO } from "@/lib/types";
import { STATUS_STYLE } from "@/lib/status";
import { keyAtEnd } from "@/lib/order";
import { leafProgressByTask } from "@/lib/tree";
import { useEditMode } from "@/lib/hooks/use-edit-mode";
import { AUTO_DATE_DAYS, isoDaysFromNow } from "@/lib/dates";
import { Tooltip } from "@/components/tooltip";
import {
  AssigneeChip,
  ContentHints,
  DuePill,
  PriorityFlag,
  ProgressCount,
} from "@/components/tree/task-meta";
import { GateCluster } from "@/components/tree/gate-chips";

/* Reading order, matching STATUSES. CANCELLED is deliberately absent — it
   hides behind a toggle. */
const COLUMNS: Status[] = [
  "BACKLOG",
  "PLANNED",
  "IN_PROGRESS",
  "ON_HOLD",
  "BLOCKED",
  "DONE",
];
const DONE_VISIBLE = 30;
const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function BoardView({ slug }: { slug: string }) {
  const { project, isLoading: loadingProject } = useProjectBySlug(slug);
  const { data, isLoading } = useTasks(project?.id ?? null);
  const tasks = useMemo(() => data ?? [], [data]);
  const { updateTask, createTask } = useTaskMutations({
    kind: "project",
    projectId: project?.id ?? "",
    gateTemplate: project?.gateTemplate ?? [],
  });
  const { openTask } = usePanelParams();
  /* Same read-only rail as the tree: a manager reading the board should not be
     one drag away from moving somebody's card between columns. `railed` is the
     manager signal used to hide the team's build gates on cards (phase 20). */
  const { canEdit, railed } = useEditMode(slug);
  const reduce = useReducedMotion();

  const [showCancelled, setShowCancelled] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  /* Constant sensor list — see the note in tree-view. Dragging is disabled on
     the card instead. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /* One rollup for the whole board, from the same leafProgress the tree rings
     and the Tool Overview use. The board previously had no completion signal
     at all — only a raw subtask count. */
  const rollup = useMemo(() => leafProgressByTask(tasks), [tasks]);

  const childCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (!t.parentId) continue;
      counts.set(t.parentId, (counts.get(t.parentId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  /**
   * Column membership is the only thing status controls; position inside a
   * column is derived, never stored. Priority first, then most recently
   * touched — so a card you just moved sits where you can see it.
   */
  const columns = useMemo(() => {
    const grouped = new Map<Status, TaskDTO[]>();
    for (const status of [...COLUMNS, "CANCELLED" as Status]) grouped.set(status, []);

    for (const task of tasks) {
      grouped.get(task.status)?.push(task);
    }

    for (const [status, list] of grouped) {
      list.sort((a, b) => {
        if (status === "DONE") {
          const at = a.completedAt ? Date.parse(a.completedAt) : 0;
          const bt = b.completedAt ? Date.parse(b.completedAt) : 0;
          if (at !== bt) return bt - at;
        }
        const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
        if (pr !== 0) return pr;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
    }
    return grouped;
  }, [tasks]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  const onDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);
      if (!over) return;
      const next = String(over.id) as Status;
      const task = tasks.find((t) => t.id === String(active.id));
      // Drop position within the column is ignored on purpose — there is no
      // intra-column order to persist.
      if (!task || task.status === next) return;
      updateTask.mutate({ id: task.id, patch: { status: next } });
    },
    [tasks, updateTask],
  );

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  /**
   * Adds at the tool root, already carrying the column's status. Root tasks
   * must be scheduled, and there is no form here to ask in, so it lands on the
   * same provisional default the tree uses and opens the panel — where the
   * date is the first thing in reach.
   */
  const addInColumn = (status: Status) => {
    if (!project) return;
    const id = newTaskId();
    createTask.mutate({
      id,
      parentId: null,
      orderKey: keyAtEnd(tasks, null),
      status,
      dueDate: isoDaysFromNow(AUTO_DATE_DAYS),
      dueProvisional: true,
    });
    openTask(id);
  };

  if (!project) {
    return loadingProject ? null : (
      <p className="px-5 py-16 text-center text-sm text-muted">
        No project with that address.
      </p>
    );
  }

  const visible = showCancelled ? [...COLUMNS, "CANCELLED" as Status] : COLUMNS;
  const cancelledCount = columns.get("CANCELLED")?.length ?? 0;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-end px-3 pb-2 sm:px-5">
        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          aria-pressed={showCancelled}
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-micro transition-colors duration-150 ease-out",
            showCancelled
              ? "border-line bg-hover text-ink"
              : "border-line text-muted hover:text-ink",
          )}
        >
          Cancelled{cancelledCount > 0 ? ` (${cancelledCount})` : ""}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* Horizontal scroll with snap on narrow screens; a plain row above. */}
        {/* items-start so an empty column is a small box rather than a
            six-hundred-pixel void with the word "empty" floating in it. */}
        <div className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-3 pb-6 sm:px-5 lg:snap-none">
          {visible.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={columns.get(status) ?? []}
              childCount={childCount}
              rollup={rollup}
              draggable={canEdit}
              isManager={railed}
              loading={isLoading}
              draggingId={activeId}
              onOpen={openTask}
              onAdd={
                !canEdit || status === "CANCELLED"
                  ? undefined
                  : () => addInColumn(status)
              }
            />
          ))}
        </div>

        <DragOverlay dropAnimation={reduce ? null : { duration: 180, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
          {activeTask ? (
            <div style={{ transform: reduce ? undefined : "rotate(1.5deg)" }}>
              <Card
                task={activeTask}
                subtasks={childCount.get(activeTask.id) ?? 0}
                progress={rollup.get(activeTask.id)}
                isManager={railed}
                overlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  tasks,
  childCount,
  rollup,
  draggable,
  isManager,
  loading,
  draggingId,
  onOpen,
  onAdd,
}: {
  status: Status;
  tasks: TaskDTO[];
  childCount: Map<string, number>;
  rollup: Map<string, { done: number; total: number; hasChildren: boolean }>;
  /** False under the manager read-only rail. */
  draggable: boolean;
  /** True for a manager: hide the team's build gates on cards (phase 20). */
  isManager: boolean;
  loading: boolean;
  draggingId: string | null;
  onOpen: (id: string) => void;
  onAdd?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const truncated = status === "DONE" && tasks.length > DONE_VISIBLE;
  const shown = truncated ? tasks.slice(0, DONE_VISIBLE) : tasks;

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_STYLE[status].label}
      className={cn(
        "flex w-[17rem] shrink-0 snap-start flex-col rounded-xl border bg-surface transition-colors duration-150 ease-out lg:w-auto lg:flex-1",
        isOver && draggingId ? "border-primary shadow-drop" : "border-line",
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span
          className={cn("h-2 w-2 rounded-full", STATUS_STYLE[status].dot)}
          aria-hidden
        />
        <h2 className="flex-1 text-sm font-medium text-ink">
          {STATUS_STYLE[status].label}
        </h2>
        <span className="text-micro tabular-nums text-muted">{tasks.length}</span>
        {onAdd ? (
          <Tooltip content={`Add a task straight into ${STATUS_STYLE[status].label}`}>
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Add a task to ${STATUS_STYLE[status].label}`}
              className="press grid h-7 w-7 place-items-center rounded-chip text-muted hover:text-ink"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        ) : null}
      </header>

      <div className="flex min-h-[6rem] flex-col gap-2 p-2">
        {loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-hover" aria-hidden />
        ) : null}

        {shown.map((task) => (
          <DraggableCard
            key={task.id}
            task={task}
            subtasks={childCount.get(task.id) ?? 0}
            progress={rollup.get(task.id)}
            draggable={draggable}
            isManager={isManager}
            dragging={draggingId === task.id}
            onOpen={onOpen}
          />
        ))}

        {truncated ? (
          <a
            href="/changelog"
            className="rounded-lg px-2 py-2 text-center text-micro text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
          >
            Older → Changelog
          </a>
        ) : null}

        {!loading && tasks.length === 0 ? (
          <p className="px-2 py-6 text-center text-micro text-muted">
            Nothing {STATUS_STYLE[status].label.toLowerCase()}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DraggableCard({
  task,
  subtasks,
  progress,
  draggable,
  isManager,
  dragging,
  onOpen,
}: {
  task: TaskDTO;
  subtasks: number;
  progress?: { done: number; total: number; hasChildren: boolean };
  /** False under the manager read-only rail. */
  draggable: boolean;
  /** True for a manager: hide the team's build gates on cards (phase 20). */
  isManager: boolean;
  dragging: boolean;
  onOpen: (id: string) => void;
}) {
  // Disabled rather than unmounted, so the hook count never changes.
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: task.id,
    disabled: !draggable,
  });

  return (
    <div ref={setNodeRef} className={cn(dragging && "opacity-35")}>
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(task.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(task.id);
          }
        }}
        className={cn(
          "touch-none rounded-lg border border-line bg-raised p-2.5 text-left transition-colors duration-150 ease-out hover:border-line",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        )}
      >
        <Card task={task} subtasks={subtasks} progress={progress} isManager={isManager} />
      </div>
    </div>
  );
}

function Card({
  task,
  subtasks,
  progress,
  isManager = false,
  overlay = false,
}: {
  task: TaskDTO;
  subtasks: number;
  progress?: { done: number; total: number; hasChildren: boolean };
  /** True for a manager: hide the team's build gates on the card (phase 20). */
  isManager?: boolean;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        overlay &&
          "w-[16rem] rounded-lg border border-primary bg-raised p-2.5 shadow-lift",
      )}
    >
      <p
        className={cn(
          "text-sm",
          task.status === "DONE" || task.status === "CANCELLED"
            ? "text-muted"
            : "text-ink",
        )}
      >
        <TaskTitle title={task.title} />
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Bare dots said nothing on a card either. The cluster carries the
            number and explains itself on hover, and five labelled pills would
            have doubled the height of a 17rem card. A manager (phase 20) sees no
            build gates on a card at all — that detail is the team's. */}
        {task.status === "CANCELLED" || isManager ? null : (
          <GateCluster gates={task.gates} />
        )}

        {/* Same rollup the tree rows and the tool ring use — a card that holds
            other work should say how far along it is, not just how many pieces
            it has. */}
        {progress ? (
          <ProgressCount
            done={progress.done}
            total={progress.total}
            hasChildren={progress.hasChildren}
          />
        ) : null}

        <PriorityFlag priority={task.priority} />
        <DuePill due={task.dueDate} status={task.status} provisional={task.dueProvisional} />
        <ContentHints
          hasDescription={task.hasDescription}
          noteCount={task.noteCount}
        />

        {subtasks > 0 ? (
          <span className="text-micro tabular-nums text-muted">
            {subtasks} subtask{subtasks === 1 ? "" : "s"}
          </span>
        ) : null}

        {/* Inline, NOT ml-auto. Pushing the avatar right looked tidy on a card
            whose chips fit one line; on a 16rem card they wrap, and the avatar
            was left stranded on a line of its own while the card grew a row
            taller than its neighbours. It flows with the other chips now and
            wraps with them.

            hideWhenEmpty, same as the tree: an absent avatar already means
            unassigned, and what nobody owns is answered properly by the
            Overview's workload chart and the lead home's Unassigned list. */}
        <AssigneeChip name={task.assigneeName} compact hideWhenEmpty />
      </div>
    </div>
  );
}
