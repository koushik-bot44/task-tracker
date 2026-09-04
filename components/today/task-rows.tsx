"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Card } from "@/components/ui/card";
import { DateChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Face } from "@/components/ui/face";
import { Check } from "@/components/ui/row";
import { cn } from "@/lib/cn";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useTaskMutations } from "@/lib/hooks/use-tasks";
import { todayKey } from "@/lib/hooks/use-today";
import { useMe } from "@/lib/hooks/use-users";
import { isLeadOrAboveRole } from "@/lib/roles";
import type { TodayDTO } from "@/lib/types";

type TodayTask = TodayDTO["tasks"][number];

/** A ticked row stays on screen this long before it goes. */
const LINGER_MS = 1000;

type Lingering = { task: TodayTask; index: number; checked: boolean };

/**
 * "Your tasks": one white card of 56px rows, overdue first (the API sorts).
 * Ticking a row marks it done; the row lingers ticked for a second and then
 * leaves, so the tick is seen to land. `justDone` holds those rows so a
 * refetch in the meantime cannot pull them out early.
 */
export function TaskRows({ tasks }: { tasks: TodayTask[] }) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const { openTask } = usePanelParams();
  const [justDone, setJustDone] = useState<Map<string, Lingering>>(() => new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    };
  }, []);

  // A row un-ticked during its linger comes back with the next refetch; once
  // the list holds it again the local copy has nothing left to do.
  useEffect(() => {
    setJustDone((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, entry] of prev) {
        if (!entry.checked && tasks.some((t) => t.id === id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const markDone = useCallback(
    (task: TodayTask, index: number) => {
      setJustDone((prev) => new Map(prev).set(task.id, { task, index, checked: true }));
      const existing = timers.current.get(task.id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        task.id,
        setTimeout(() => {
          timers.current.delete(task.id);
          setJustDone((prev) => {
            const next = new Map(prev);
            next.delete(task.id);
            return next;
          });
          void qc.invalidateQueries({ queryKey: todayKey });
        }, LINGER_MS),
      );
    },
    [qc],
  );

  const unmark = useCallback((task: TodayTask) => {
    const existing = timers.current.get(task.id);
    if (existing) {
      clearTimeout(existing);
      timers.current.delete(task.id);
    }
    setJustDone((prev) => {
      const entry = prev.get(task.id);
      if (!entry) return prev;
      return new Map(prev).set(task.id, { ...entry, checked: false });
    });
  }, []);

  // The list as fetched, with any lingering rows put back where they were.
  const rows: TodayTask[] = [...tasks];
  for (const { task, index } of justDone.values()) {
    if (!rows.some((r) => r.id === task.id)) rows.splice(Math.min(index, rows.length), 0, task);
  }

  if (rows.length === 0) return <EmptyState title="Nothing waiting on you." />;

  return (
    <Card as="div" className="py-1">
      <ul>
        <AnimatePresence initial={false}>
          {rows.map((task, i) => (
            <motion.li
              key={task.id}
              layout={!reduce}
              initial={false}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <TaskRow
                task={task}
                checked={justDone.get(task.id)?.checked ?? false}
                onDone={() => markDone(task, i)}
                onUndo={() => unmark(task)}
                onOpen={() => openTask(task.id)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

function TaskRow({
  task,
  checked,
  onDone,
  onUndo,
  onOpen,
}: {
  task: TodayTask;
  checked: boolean;
  onDone: () => void;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const { show: toast } = useToast();
  const { data: me } = useMe();
  // The tick is a lead's to give (owner, 2026-09-04); a team member sees it.
  const canTick = isLeadOrAboveRole(me?.role);
  const { updateTask } = useTaskMutations({ kind: "project", projectId: task.projectId ?? "" });
  const title = task.title.trim() || "Untitled";

  const toggle = (next: boolean) => {
    if (next) onDone();
    else onUndo();
    updateTask.mutate(
      { id: task.id, patch: { status: next ? "DONE" : task.status === "DONE" ? "TODO" : task.status } },
      {
        onError: (e) => {
          onUndo();
          toast({ message: (e as Error).message, tone: "danger" });
        },
      },
    );
  };

  return (
    <div className="flex min-h-[56px] items-center gap-1 pl-2 pr-3">
      <Check checked={checked} onChange={toggle} label={checked ? `Not done yet: ${title}` : `Done: ${title}`} readOnly={!canTick} />
      <button type="button" onClick={onOpen} className="press flex min-w-0 flex-1 items-center gap-3 rounded-input py-1.5 pl-1 pr-1 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn("flex items-center gap-1.5 text-row", checked ? "text-muted line-through" : "text-ink")}>
            {task.important ? <Star className="h-4 w-4 shrink-0 fill-primary text-primary" aria-label="Important" /> : null}
            <span className="truncate">{title}</span>
          </span>
          {task.projectName ? <span className="block truncate text-micro text-muted">{task.projectName}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {task.dueDate ? <DateChip iso={task.dueDate} status={checked ? "DONE" : task.status} /> : null}
          {task.givenByName ? <Face name={task.givenByName} size="sm" title={`Given by ${task.givenByName}`} /> : null}
        </span>
      </button>
    </div>
  );
}
