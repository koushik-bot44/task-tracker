"use client";

import { Pencil, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { NonNegotiableDTO, RoutineWeekDTO } from "@/lib/types";
import { inputCls, weekdayInitial } from "./shared";

/**
 * The non-negotiables, as the Family Routine Agreement keeps them (2026-09-25): fixed
 * lines that hold every day, logged ONLY on a day they were crossed. The parent
 * taps a day to log a crossing (and taps again to take it back); the person sees
 * the same log from their side. Changing the lines works like the habits above
 * (owner, 2026-10-02): "Edit" opens rename (pencil), remove (bin) and add; the
 * week view itself carries no delete buttons.
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
  const { crossNonNegotiableDay } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [editing, setEditing] = useState(false);
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const crossed = items.reduce((a, n) => a + n.crossedThisWeek, 0);

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldAlert className={cn("h-5 w-5 shrink-0", crossed > 0 ? "text-warn-ink" : "pk-fg-soft")} strokeWidth={2} aria-hidden />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold pk-fg">Non-negotiables</h2>
            <p className="mt-0.5 text-micro pk-fg-soft">
              {crossed === 0 ? "Nothing crossed this week." : `${crossed} crossed this week.`}
              {readOnly ? "" : " Tap a day only when a line was crossed."}
            </p>
          </div>
        </div>
        {readOnly ? null : (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="press shrink-0 rounded-card px-3 py-1.5 text-micro font-medium pk-fg hover:bg-[color:var(--pk-cell)]"
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {editing && !readOnly ? (
        <NonNegotiableEditor items={items} weekParam={weekParam} personId={personId} />
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm pk-fg-soft">{readOnly ? "No non-negotiables yet." : "No non-negotiables yet. Tap “Edit” to add one."}</p>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <div key={n.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-sm font-medium pk-fg">
                  {n.name}
                  {n.addedBy === "PERSON" ? <span className="pk-chip ml-2 rounded-card px-2 py-0.5 align-middle text-micro font-medium">his own</span> : null}
                </span>
                <span className={cn("shrink-0 text-micro", n.crossedThisWeek > 0 ? "font-semibold text-warn-ink" : "pk-fg-soft")}>
                  {n.crossedThisWeek === 0 ? "0 crossed" : `${n.crossedThisWeek} crossed`}
                </span>
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

/** Edit mode, the same shape as the habits' (weekly-grid SegmentEditor): tap a name
    to rename it, the bin removes it (with a confirm), the box at the bottom adds one. */
function NonNegotiableEditor({ items, weekParam, personId }: { items: NonNegotiableDTO[]; weekParam: string | null; personId: string | null }) {
  const { addNonNegotiable, updateNonNegotiable, deleteNonNegotiable } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [name, setName] = useState("");
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const add = () => {
    if (!name.trim()) return;
    addNonNegotiable.mutate({ name: name.trim() }, { onSuccess: () => setName(""), onError: err });
  };

  return (
    <div className="space-y-2">
      {items.map((n) => (
        <div key={n.id} className="flex items-center gap-2 rounded-card pk-cell p-2">
          <button
            type="button"
            onClick={() => { const next = window.prompt("Rename non-negotiable", n.name)?.trim(); if (next && next !== n.name) updateNonNegotiable.mutate({ id: n.id, patch: { name: next } }, { onError: err }); }}
            aria-label={`Rename ${n.name}`}
            className="press flex min-w-0 flex-1 items-center gap-1.5 rounded-card px-1 py-1.5 text-left text-sm pk-fg hover:text-primary-ink"
          >
            <span className="min-w-0">{n.name}</span>
            {n.addedBy === "PERSON" ? <span className="pk-chip shrink-0 rounded-card px-2 py-0.5 text-micro font-medium">his own</span> : null}
            <Pencil className="h-3.5 w-3.5 shrink-0 pk-fg-soft" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => { if (window.confirm(`Remove \u201c${n.name}\u201d?`)) deleteNonNegotiable.mutate(n.id, { onError: err }); }}
            aria-label={`Remove ${n.name}`}
            className="press grid h-9 w-9 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          aria-label="New non-negotiable"
          className={cn(inputCls, "h-10 flex-1")}
        />
        <button type="button" onClick={add} aria-label="Add non-negotiable" className="press grid h-10 w-10 shrink-0 place-items-center rounded-card bg-primary text-on-primary">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
