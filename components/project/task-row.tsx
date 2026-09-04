"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { Face } from "@/components/ui/face";
import { Check } from "@/components/ui/row";
import { cn } from "@/lib/cn";
import { dateState, dateWord, sameDay } from "@/lib/dates";
import type { TaskDTO } from "@/lib/types";

/** Drag ids are namespaced so a task and a box can never collide. */
export const taskDragId = (id: string) => `task:${id}`;
export const boxDropId = (milestoneId: string | null) => `box:${milestoneId ?? "none"}`;
export const boxIdFromDrop = (dropId: string | number): string | null => {
  const raw = String(dropId).replace(/^box:/, "");
  return raw === "none" ? null : raw;
};

/** Title (+ "2 of 3 steps"), then the date word only when it is not the review day, then the Face. */
function TitleBlock({ task, reviewDate }: { task: TaskDTO; reviewDate: string | null }) {
  const done = task.status === "DONE";
  const showDate = Boolean(task.dueDate) && !sameDay(task.dueDate, reviewDate);
  const late = task.dueDate ? dateState(task.dueDate, task.status) === "overdue" : false;
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-row", done ? "text-muted" : "text-ink")}>{task.title.trim() || "Untitled task"}</span>
        {task.stepCount > 0 ? (
          <span className="block text-micro text-muted">
            {task.stepsDone} of {task.stepCount} steps
          </span>
        ) : null}
      </span>
      {showDate && task.dueDate ? (
        <span className={cn("shrink-0 text-micro font-medium", late && !done ? "text-danger-ink" : "text-muted")}>{dateWord(task.dueDate)}</span>
      ) : null}
      {task.assigneeName ? <Face name={task.assigneeName} /> : null}
    </>
  );
}

/**
 * One 56px row inside a milestone box: Check · title · Face. The row opens the
 * drawer; the Check ticks it done. Drag it to another box — by the grip on a
 * desktop, by a long-press anywhere on the row on a phone.
 */
export function TaskRow({
  task,
  reviewDate,
  onToggleDone,
  onOpen,
}: {
  task: TaskDTO;
  reviewDate: string | null;
  onToggleDone: (done: boolean) => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: taskDragId(task.id), data: { task } });
  const done = task.status === "DONE";
  const title = task.title.trim() || "Untitled task";
  // Split the sensors: the grip listens for the pointer (desktop), the whole
  // row listens for a long-press (touch). Neither fights a scroll.
  const onPointerDown = listeners?.onPointerDown as React.PointerEventHandler<HTMLButtonElement> | undefined;
  const onTouchStart = listeners?.onTouchStart as React.TouchEventHandler<HTMLLIElement> | undefined;

  return (
    <li
      ref={setNodeRef}
      onTouchStart={onTouchStart}
      data-task-row={task.id}
      className={cn("group relative flex items-center transition-opacity duration-150", isDragging && "opacity-40")}
      style={{ touchAction: "manipulation", WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none" }}
    >
      <button
        type="button"
        {...attributes}
        onPointerDown={onPointerDown}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Drag ${title} to another milestone`}
        data-drag-grip
        className="absolute -left-4 top-1/2 hidden h-11 w-4 -translate-y-1/2 cursor-grab place-items-center text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 md:grid"
        style={{ touchAction: "none" }}
      >
        <GripVertical className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
      <Check className="-ml-2" checked={done} onChange={onToggleDone} label={done ? `Mark ${title} not done` : `Mark ${title} done`} />
      <button type="button" onClick={onOpen} className="press flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-card py-1 pl-1 pr-1 text-left">
        <TitleBlock task={task} reviewDate={reviewDate} />
      </button>
    </li>
  );
}

/** What travels under the finger: the same row, lifted. */
export function TaskRowOverlay({ task, reviewDate }: { task: TaskDTO; reviewDate: string | null }) {
  const done = task.status === "DONE";
  return (
    <div className="card flex min-h-[56px] items-center gap-3 px-4 shadow-lift">
      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", done ? "border-ok bg-ok" : "border-muted")} aria-hidden />
      <TitleBlock task={task} reviewDate={reviewDate} />
    </div>
  );
}
