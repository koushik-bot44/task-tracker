"use client";

import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { RoutineTaskDTO } from "@/lib/types";
import { inputCls } from "./shared";

/** "2026-09-02" -> "Wed" (UTC so the date key isn't shifted by the local zone). */
function shortDay(key: string): string {
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/**
 * Tasks the manager assigns; the PERSON checks them off from their own screen.
 * Phase 42: tasks are WEEK-SCOPED — the list shows only the viewed week's tasks
 * (+ the undated "any day" ones), and a new "this week" task attaches to the viewed
 * week. The manager sees which are done (read-only ticks — the person does the check).
 */
export function TasksSection({ tasks, today, weekParam, personId, readOnly = false }: { tasks: RoutineTaskDTO[]; today: string; weekParam: string | null; personId: string | null; readOnly?: boolean }) {
  const { addTask, deleteTask } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [title, setTitle] = useState("");
  const [forThisWeek, setForThisWeek] = useState(true);
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  // "This week" pins the task to the viewed week: today when it's the current week,
  // otherwise that week's Monday (weekParam). "Any day" leaves it undated.
  const add = () => {
    if (!title.trim()) return;
    addTask.mutate({ title: title.trim(), dueDate: forThisWeek ? (weekParam ?? today) : null }, { onSuccess: () => setTitle(""), onError: err });
  };
  const relevant = tasks;
  const dueLabel = (t: RoutineTaskDTO) => (t.done ? "done" : t.dueDate === null ? "any day" : t.dueDate === today ? "today" : shortDay(t.dueDate));

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <h2 className="mb-3 font-display text-lg font-semibold pk-fg">Tasks</h2>
      {readOnly ? null : (
        <div className="mb-3 flex items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Add a task for them…" aria-label="New task" className={cn(inputCls, "h-11 flex-1")} />
          <button type="button" onClick={() => setForThisWeek((v) => !v)} aria-pressed={forThisWeek} className={cn("press h-11 shrink-0 rounded-card px-3 text-micro font-medium", forThisWeek ? "pk-tab-active" : "pk-chip pk-fg-soft")} title="Pin to this week, or any day">
            {forThisWeek ? "This week" : "Any day"}
          </button>
          <button type="button" onClick={add} disabled={!title.trim() || addTask.isPending} aria-label="Add task" className="press grid h-11 w-11 shrink-0 place-items-center rounded-card bg-primary text-on-primary disabled:opacity-40"><Plus className="h-5 w-5" aria-hidden /></button>
        </div>
      )}
      {relevant.length === 0 ? (
        <p className="py-4 text-center text-sm pk-fg-soft">{readOnly ? "No tasks." : "No tasks yet — add one above."}</p>
      ) : (
        <ul className="space-y-2">
          {relevant.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2.5">
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", t.done ? "border-ok bg-ok text-on-primary" : "border-line")}>
                {t.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-sm", t.done ? "pk-fg-soft line-through" : "pk-fg")}>{t.title}</span>
              <span className="shrink-0 text-micro pk-fg-soft">{dueLabel(t)}</span>
              {readOnly ? null : (
                <button type="button" onClick={() => deleteTask.mutate(t.id, { onError: err })} aria-label={`Remove ${t.title}`} className="press grid h-7 w-7 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink"><X className="h-4 w-4" aria-hidden /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
