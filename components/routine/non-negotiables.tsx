"use client";

import { Plus, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { NonNegotiableDTO, RoutineWeekDTO } from "@/lib/types";
import { inputCls, weekdayInitial } from "./shared";

/**
 * The rules (the agreement's non-negotiables), as the Family Routine Agreement keeps them (2026-09-25): fixed
 * lines that hold every day, logged ONLY on a day they were crossed. The parent
 * taps a day to log a crossing (and taps again to take it back); the person sees
 * the same log from their side. Nothing here is a chore to tick: the count should
 * read 0, and a crossing is dealt with the same day, not saved for Sunday.
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
  const { addNonNegotiable, deleteNonNegotiable, crossNonNegotiableDay } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const crossed = items.reduce((a, n) => a + n.crossedThisWeek, 0);

  const add = () => {
    if (!name.trim()) return;
    addNonNegotiable.mutate({ name: name.trim() }, { onSuccess: () => { setName(""); setAdding(false); }, onError: err });
  };

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert className={cn("h-5 w-5 shrink-0", crossed > 0 ? "text-warn-ink" : "pk-fg-soft")} strokeWidth={2} aria-hidden />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold pk-fg">Rules</h2>
            <p className="mt-0.5 text-micro pk-fg-soft">
              {crossed === 0 ? "Nothing crossed this week." : `${crossed} crossed this week — dealt with the same day, not scored.`}
              {readOnly ? "" : " Tap a day only when a line was crossed."}
            </p>
          </div>
        </div>
        {readOnly ? null : (
          <button type="button" onClick={() => setAdding((v) => !v)} className="press h-11 shrink-0 rounded-card px-3 text-sm font-medium pk-fg hover:bg-[color:var(--pk-cell)]">
            {adding ? "Close" : "Add"}
          </button>
        )}
      </div>

      {adding && !readOnly ? (
        <div className="mb-4 flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} aria-label="New rule" placeholder="A line that holds every day" className={cn(inputCls, "h-11 flex-1")} />
          <button type="button" onClick={add} aria-label="Add rule" className="press grid h-11 w-11 shrink-0 place-items-center rounded-card bg-primary text-on-primary"><Plus className="h-4 w-4" aria-hidden /></button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm pk-fg-soft">No rules yet. These are the fixed lines — add one if it helps.</p>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <div key={n.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-sm font-medium pk-fg">{n.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("text-micro", n.crossedThisWeek > 0 ? "font-semibold text-warn-ink" : "pk-fg-soft")}>
                    {n.crossedThisWeek === 0 ? "0 crossed" : `${n.crossedThisWeek} crossed`}
                  </span>
                  {readOnly ? null : (
                    <button type="button" onClick={() => { if (window.confirm(`Remove \u201c${n.name}\u201d?`)) deleteNonNegotiable.mutate(n.id, { onError: err }); }} aria-label={`Remove ${n.name}`} className="press grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {week.days.map((d) => {
                  const isCrossed = n.days[d] === true;
                  const locked = readOnly || d > today;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={locked}
                      onClick={() => crossNonNegotiableDay.mutate({ nonNegotiableId: n.id, date: d, crossed: !isCrossed }, { onError: err })}
                      aria-pressed={isCrossed}
                      aria-label={`${n.name}, ${weekdayInitial(d)} \u2014 ${isCrossed ? "crossed" : "held"}${locked ? "" : isCrossed ? " (tap to take it back)" : " (tap to log a crossing)"}`}
                      className={cn(
                        "pk-press grid h-11 place-items-center rounded-card text-sm",
                        isCrossed ? "pk-cell pk-missed font-semibold" : "pk-cell",
                        locked ? "cursor-default opacity-60" : "pk-row-hover",
                        d === today ? "pk-today" : "",
                      )}
                    >
                      {isCrossed ? <X className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : weekdayInitial(d)}
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
