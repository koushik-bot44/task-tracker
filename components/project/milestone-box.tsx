"use client";

import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { TaskRow, boxDropId } from "@/components/project/task-row";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { dateWord, shortDate } from "@/lib/dates";
import { MILESTONE_OUTCOME_LABEL, type MilestoneDTO, type TaskDTO } from "@/lib/types";

export type BoxState = "current" | "past" | "future" | "loose";

const taskWord = (n: number) => (n === 0 ? "No tasks yet" : `${n} task${n === 1 ? "" : "s"}`);

/**
 * One milestone box from the owner's sketch. CURRENT is open and accented;
 * PAST folds to one line ("Reviewed 12 Sep · On track · 4 tasks"); FUTURE
 * folds to "3 tasks". "Not in a milestone yet" is the loose box at the end.
 * Every box is a drop target for a row dragged from another box.
 */
export function MilestoneBox({
  milestone,
  index,
  state,
  tasks,
  canManage,
  onGiveTask,
  onMoveReview,
  onToggleDone,
  onOpenTask,
}: {
  milestone: MilestoneDTO | null;
  index: number;
  state: BoxState;
  tasks: TaskDTO[];
  canManage: boolean;
  onGiveTask: () => void;
  onMoveReview: () => void;
  onToggleDone: (task: TaskDTO, done: boolean) => void;
  onOpenTask: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const { setNodeRef, isOver } = useDroppable({ id: boxDropId(milestone?.id ?? null) });
  const [expanded, setExpanded] = useState(false);
  const open = state === "current" || state === "loose" || expanded;
  const reviewDate = milestone?.reviewDate ?? null;
  const name = milestone?.name ?? "Not in a milestone yet";

  let line: string | null = null;
  if (milestone && state === "past") {
    const recorded = milestone.outcome ? MILESTONE_OUTCOME_LABEL[milestone.outcome] : "not recorded yet";
    line = `${milestone.outcome ? "Reviewed" : "Review"} ${shortDate(milestone.reviewDate)} · ${recorded} · ${taskWord(tasks.length).toLowerCase()}`;
  } else if (state === "future") {
    line = taskWord(tasks.length);
  }

  const dateBlock = milestone ? (
    <>
      <span className="block text-sm font-medium text-ink">{state === "past" ? shortDate(milestone.reviewDate) : dateWord(milestone.reviewDate)}</span>
      <span className="smallcaps block text-muted">Review</span>
    </>
  ) : null;

  return (
    <div ref={setNodeRef} data-box={milestone?.id ?? "none"} className="rounded-card">
      <Card as="section" accent={state === "current"} className="relative px-4 pb-2 pt-3">
        {/* The drop tint sits in its own layer so the card's white never wins over it. */}
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 rounded-card bg-primary-soft transition-opacity duration-150", isOver ? "opacity-100" : "opacity-0")}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {milestone ? <p className="smallcaps text-muted">Milestone {index}</p> : null}
            <h2 className="truncate text-row font-semibold text-ink">{name}</h2>
          </div>
          {milestone ? (
            canManage ? (
              <button
                type="button"
                onClick={onMoveReview}
                aria-label={`Review ${dateWord(milestone.reviewDate)}. Move the review date`}
                className="press -mr-2 -mt-1 shrink-0 rounded-input px-2 py-1 text-right"
              >
                {dateBlock}
              </button>
            ) : (
              <div className="shrink-0 text-right">{dateBlock}</div>
            )
          ) : null}
        </div>

        {line ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="press -mx-2 mt-1 flex h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-input px-2 text-left text-sm text-muted"
          >
            <span className="min-w-0 flex-1 truncate">{line}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-150", expanded && "rotate-180")} strokeWidth={2} aria-hidden />
          </button>
        ) : null}

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="rows"
              initial={reduce ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: reduce ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              {tasks.length > 0 ? (
                <ul className="mt-1">
                  {tasks.map((t) => (
                    <TaskRow key={t.id} task={t} reviewDate={reviewDate} onToggleDone={(done) => onToggleDone(t, done)} onOpen={() => onOpenTask(t.id)} />
                  ))}
                </ul>
              ) : state === "current" || state === "loose" ? (
                <p className="mt-2 px-1 text-sm text-muted">No tasks yet.</p>
              ) : null}
              {state !== "past" ? (
                <button
                  type="button"
                  onClick={onGiveTask}
                  className="press flex min-h-[56px] w-full items-center gap-3 rounded-card text-left text-row font-medium text-primary-ink"
                >
                  <span className="-ml-2 grid h-11 w-11 shrink-0 place-items-center">
                    <Plus className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                  </span>
                  Add a task
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Card>
    </div>
  );
}
