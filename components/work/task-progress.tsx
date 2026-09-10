"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useWorkMutations } from "@/lib/hooks/use-work";
import { FINISHED_STATES, type TaskDTO } from "@/lib/types";
import { snButton } from "./sn";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * How far along a task is (owner, 2026-09-11): a bar with its number, marked
 * by hand the way a project's own number is. Whoever may change the task marks
 * it; a finished task reads 100% until somebody marks it otherwise.
 */
export function TaskProgress({ task, canEdit }: { task: TaskDTO; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const finished = FINISHED_STATES.includes(task.state);
  const value = clamp(task.progress ?? (finished ? 100 : 0));
  const marked = task.progress !== null || finished;
  return (
    <div className="flex h-8 items-center gap-2">
      <span
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-hover"
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${value}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right text-[13px] font-semibold text-ink">{marked ? `${value}%` : <span className="font-normal text-muted">Not marked</span>}</span>
      {canEdit ? (
        <button type="button" onClick={() => setOpen(true)} className={snButton}>
          Mark
        </button>
      ) : null}
      <ProgressSheet open={open} onClose={() => setOpen(false)} task={task} />
    </div>
  );
}

function ProgressSheet({ open, onClose, task }: { open: boolean; onClose: () => void; task: TaskDTO }) {
  const { update } = useWorkMutations(task.id);
  const { show: toast } = useToast();
  const [value, setValue] = useState(clamp(task.progress ?? 0));

  useEffect(() => {
    if (open) setValue(clamp(task.progress ?? 0));
  }, [open, task.progress]);

  const save = (progress: number | null) => {
    if (update.isPending) return;
    update.mutate(
      { progress },
      {
        onSuccess: () => {
          onClose();
          toast({ message: progress === null ? "Progress cleared" : `Set to ${progress}%` });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How far along?"
      subtitle={task.title.trim() || task.ref}
      footer={
        <div className="flex gap-2">
          {task.progress !== null ? (
            <Button variant="secondary" onClick={() => save(null)} disabled={update.isPending}>
              Clear
            </Button>
          ) : null}
          <Button variant="primary" className="flex-1" onClick={() => save(clamp(value))} loading={update.isPending}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        <Field label="Your number">
          <div className="flex items-center gap-3">
            <div className="w-24">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={value}
                onChange={(e) => setValue(clamp(Number(e.target.value) || 0))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    save(clamp(value));
                  }
                }}
                aria-label="Percent done"
                className={inputClass}
              />
            </div>
            <span className="text-sm text-muted">%</span>
          </div>
        </Field>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => setValue(clamp(Number(e.target.value)))}
          aria-label="How far along"
          className="w-full accent-[var(--primary)]"
        />
      </div>
    </Sheet>
  );
}
