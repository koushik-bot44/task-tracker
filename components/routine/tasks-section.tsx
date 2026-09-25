"use client";

import { Check, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { RoutineTaskDTO } from "@/lib/types";
import { inputCls, prettyDate, weekdayShort } from "./shared";

/**
 * Tasks the parent side sets; the PERSON checks them off from their own screen.
 * 2026-09-25: a task is for a DAY (picked, today by default), or runs FROM one day
 * TO another (it then stands on every day between), or is for any day. The list
 * shows the viewed week's tasks plus the undated ones; a task running across the
 * week is in it too. Ticks are read-only here — the person does the check.
 */
export function TasksSection({ tasks, today, weekParam, personId, readOnly = false }: { tasks: RoutineTaskDTO[]; today: string; weekParam: string | null; personId: string | null; readOnly?: boolean }) {
  const { addTask, deleteTask } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<"day" | "span" | "any">("day");
  // The day defaults to today in the current week, else that week's Monday.
  const [due, setDue] = useState(weekParam ?? today);
  const [from, setFrom] = useState(weekParam ?? today);
  useEffect(() => { setDue(weekParam ?? today); setFrom(weekParam ?? today); }, [weekParam, today]);
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const add = () => {
    if (!title.trim()) return;
    if (when !== "any" && !due) return toast({ message: "Pick the day.", tone: "danger" });
    if (when === "span" && from > due) return toast({ message: "The first day must be on or before the last day.", tone: "danger" });
    addTask.mutate(
      { title: title.trim(), dueDate: when === "any" ? null : due, startDate: when === "span" ? from : null },
      { onSuccess: () => setTitle(""), onError: err },
    );
  };
  const dueLabel = (t: RoutineTaskDTO) => {
    if (t.done) return "done";
    if (t.dueDate === null) return "any day";
    if (t.startDate && t.startDate < t.dueDate) return `${prettyDate(t.startDate)} – ${prettyDate(t.dueDate)}`;
    if (t.dueDate === today) return "today";
    return `${weekdayShort(t.dueDate)} ${prettyDate(t.dueDate)}`;
  };

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <h2 className="mb-3 font-display text-lg font-semibold pk-fg">Tasks</h2>
      {readOnly ? null : (
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Add a task for them…" aria-label="New task" className={cn(inputCls, "min-w-0 flex-1")} />
            <button type="button" onClick={add} disabled={!title.trim() || addTask.isPending} aria-label="Add task" className="press grid h-11 w-11 shrink-0 place-items-center rounded-card bg-primary text-on-primary disabled:opacity-40"><Plus className="h-5 w-5" aria-hidden /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="pk-glass inline-flex h-11 shrink-0 items-center rounded-card" role="group" aria-label="When">
              {([["day", "A day"], ["span", "From – to"], ["any", "Any day"]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setWhen(k)} aria-pressed={when === k} className={cn("pk-press h-11 rounded-card px-3 text-sm font-medium", when === k ? "pk-tab-active" : "pk-tab pk-tab-hover")}>
                  {label}
                </button>
              ))}
            </div>
            {when === "span" ? (
              <input type="date" value={from} max={due || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From day" className={cn(inputCls, "min-w-0 flex-1")} />
            ) : null}
            {when !== "any" ? (
              <input type="date" value={due} min={when === "span" ? from || undefined : undefined} onChange={(e) => setDue(e.target.value)} aria-label={when === "span" ? "To day" : "Day"} className={cn(inputCls, "min-w-0 flex-1")} />
            ) : null}
          </div>
        </div>
      )}
      {tasks.length === 0 ? (
        <p className="py-4 text-center text-sm pk-fg-soft">{readOnly ? "No tasks." : "No tasks yet — add one above."}</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2.5">
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", t.done ? "border-ok bg-ok text-on-primary" : "border-line")}>
                {t.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-sm", t.done ? "pk-fg-soft line-through" : "pk-fg")}>{t.title}</span>
              {t.addedBy === "PERSON" ? <span className="shrink-0 rounded-chip pk-chip px-2 py-0.5 text-micro">his own</span> : t.addedBy === "MENTOR" ? <span className="shrink-0 rounded-chip pk-chip px-2 py-0.5 text-micro">tutor</span> : null}
              <span className="shrink-0 text-micro pk-fg-soft">{dueLabel(t)}</span>
              {readOnly ? null : (
                <button type="button" onClick={() => deleteTask.mutate(t.id, { onError: err })} aria-label={`Remove ${t.title}`} className="press grid h-11 w-11 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink"><X className="h-4 w-4" aria-hidden /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
