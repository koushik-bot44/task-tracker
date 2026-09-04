"use client";

import { Check, Plus, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { NonNegotiableDTO, RoutineWeekDTO } from "@/lib/types";
import { inputCls, weekdayInitial } from "./shared";

/**
 * Non-negotiables (phase 42): the manager SCHEDULES which days each rule applies —
 * tapping a day cell turns it on/off. The PERSON then marks each scheduled day done
 * from their own screen; the manager sees those ✓s here (read-only for the manager).
 * A green cell = the person did it; an outlined cell = scheduled, still to do.
 */
export function NonNegotiables({
  items,
  week,
  weekParam,
  personId,
  today,
  readOnly = false,
}: {
  items: NonNegotiableDTO[];
  week: RoutineWeekDTO;
  weekParam: string | null;
  personId: string | null;
  today: string;
  readOnly?: boolean;
}) {
  const { addNonNegotiable, deleteNonNegotiable, setNonNegotiableDay } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const required = items.reduce((a, n) => a + n.requiredThisWeek, 0);
  const done = items.reduce((a, n) => a + n.doneThisWeek, 0);

  const add = () => {
    if (!name.trim()) return;
    addNonNegotiable.mutate({ name: name.trim() }, { onSuccess: () => { setName(""); setAdding(false); }, onError: err });
  };

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold pk-fg">Non-negotiables</h2>
            <p className="mt-0.5 text-micro pk-fg-soft">
              {readOnly
                ? required === 0 ? "None set this week." : `${done} of ${required} done this week`
                : required === 0 ? "Tap the days each rule applies — they mark them done." : `${done} of ${required} done · tap a day to add/remove it`}
            </p>
          </div>
        </div>
        {readOnly ? null : (
          <button type="button" onClick={() => setAdding((v) => !v)} className="press shrink-0 rounded-card px-3 py-1.5 text-micro font-medium pk-fg hover:bg-[color:var(--pk-cell)]">
            {adding ? "Close" : "Add"}
          </button>
        )}
      </div>

      {adding && !readOnly ? (
        <div className="mb-4 flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="e.g. No screens past bedtime" aria-label="New non-negotiable" className={cn(inputCls, "h-10 flex-1")} />
          <button type="button" onClick={add} aria-label="Add non-negotiable" className="press grid h-10 w-10 shrink-0 place-items-center rounded-card bg-primary text-on-primary"><Plus className="h-4 w-4" aria-hidden /></button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm pk-fg-soft">None set. These are the serious, fixed lines — add one if it helps.</p>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <div key={n.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium pk-fg">{n.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("text-micro", n.missedThisWeek > 0 ? "text-warn-ink" : "pk-fg-soft")}>
                    {n.requiredThisWeek === 0 ? "not set" : `${n.doneThisWeek}/${n.requiredThisWeek} done`}
                  </span>
                  {readOnly ? null : (
                    <button type="button" onClick={() => { if (window.confirm(`Remove “${n.name}”?`)) deleteNonNegotiable.mutate(n.id, { onError: err }); }} aria-label={`Remove ${n.name}`} className="press grid h-6 w-6 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {week.days.map((d) => {
                  const scheduled = d in n.days;
                  const isDone = n.days[d] ?? false;
                  const state = !scheduled ? "off" : isDone ? "done" : "todo";
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={readOnly}
                      onClick={() => setNonNegotiableDay.mutate({ nonNegotiableId: n.id, date: d, required: !scheduled }, { onError: err })}
                      aria-pressed={scheduled}
                      aria-label={`${n.name}, ${weekdayInitial(d)} — ${state === "off" ? "not required" : state === "done" ? "done" : "required, not done yet"}${readOnly ? "" : " (tap to add or remove this day)"}`}
                      className={cn(
                        "pk-press grid h-8 place-items-center rounded-card text-micro",
                        state === "done" ? "pk-cell pk-met" : state === "todo" ? "pk-cell pk-todo" : "pk-cell border-dashed opacity-70",
                        readOnly ? "cursor-default" : "pk-row-hover",
                        d === today ? "pk-today" : "",
                      )}
                    >
                      {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> : weekdayInitial(d)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
