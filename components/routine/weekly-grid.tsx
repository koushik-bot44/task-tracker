"use client";

import { Check, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { GridSegment, HabitMarkValue, HabitSegmentDTO, RoutineWeekDTO } from "@/lib/types";
import { inputCls, weekdayInitial } from "./shared";

/** The tap cycle: empty → MET → MISSED → N/A → empty. */
export const NEXT_MARK: Record<"empty" | HabitMarkValue, HabitMarkValue | null> = {
  empty: "MET",
  MET: "MISSED",
  MISSED: "NA",
  NA: null,
};

const CELL: Record<HabitMarkValue, { cls: string; icon: typeof Check; label: string }> = {
  MET: { cls: "border-ok bg-ok-soft text-ok-ink", icon: Check, label: "met" },
  MISSED: { cls: "border-danger bg-danger-soft text-danger-ink", icon: X, label: "missed" },
  NA: { cls: "border-line bg-hover text-muted", icon: Minus, label: "not applicable" },
};

export function WeeklyGrid({
  segments,
  week,
  weekParam,
  personId,
  today,
  readOnly = false,
}: {
  segments: HabitSegmentDTO[];
  week: RoutineWeekDTO;
  weekParam: string | null;
  personId: string | null;
  today: string;
  readOnly?: boolean;
}) {
  const { markHabit } = useRoutineMutations(weekParam, personId);
  const [editing, setEditing] = useState(false);
  const totalMet = segments.reduce((a, s) => a + s.metThisWeek, 0);
  const totalTarget = segments.reduce((a, s) => a + s.targetThisWeek, 0);

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold pk-fg">Weekly habits</h2>
          <p className="mt-0.5 text-micro pk-fg-soft">
            {totalTarget > 0 ? `${totalMet} of ${totalTarget} targets met this week` : "A gentle picture of the week."}
          </p>
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

      {segments.length === 0 && !editing ? (
        <p className="py-6 text-center text-sm pk-fg-soft">{readOnly ? "No habits yet." : "No habits yet. Tap “Edit” to add a segment."}</p>
      ) : editing && !readOnly ? (
        <SegmentEditor segments={segments} weekParam={weekParam} personId={personId} />
      ) : (
        <div className="space-y-6">
          {segments.map((seg) => (
            <SegmentGrid key={seg.id} seg={seg} week={week} today={today} readOnly={readOnly} glass onMark={(habitId, date, value) => markHabit.mutate({ habitId, date, value })} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One segment's tap-to-cycle grid — SHARED by the manager Routine view and the
 * person's own /kid view (no fork). `onMark` decides where the tap goes (manager
 * habit-mark endpoint vs the person kid endpoint). `showScore` renders the weekly
 * tallies (manager only — the person never sees the score). `maxDate` disables any
 * day after it (the person can't mark future days).
 */
/** Phase 45: the PERSON screen passes `glass` so its cells become frosted-glass
    (translucent tints that read on the day/night scene). The manager view never
    passes it, so its grid is unchanged. */
const CELL_GLASS: Record<HabitMarkValue, string> = { MET: "pk-met", MISSED: "pk-missed", NA: "pk-na" };

export function SegmentGrid({
  seg,
  week,
  today,
  onMark,
  showScore = true,
  maxDate,
  readOnly = false,
  glass = false,
}: {
  seg: GridSegment;
  week: RoutineWeekDTO;
  today: string;
  onMark: (habitId: string, date: string, value: HabitMarkValue | null) => void;
  showScore?: boolean;
  maxDate?: string;
  readOnly?: boolean;
  glass?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className={cn("min-w-0 truncate text-sm font-semibold", glass ? "pk-fg" : "text-ink")}>{seg.name}</h3>
        {showScore && seg.targetThisWeek !== undefined ? (
          <span className="shrink-0 text-micro pk-fg-soft">{seg.metThisWeek}/{seg.targetThisWeek}</span>
        ) : null}
      </div>

      {/* weekday header, aligned to the 7 cell columns */}
      <div className="grid grid-cols-7 gap-1.5">
        {week.days.map((d) => (
          <span key={d} className={cn("text-center text-micro", glass ? (d === today ? "pk-fg font-bold" : "pk-fg-soft") : d === today ? "font-bold text-primary-ink" : "text-muted")}>
            {weekdayInitial(d)}
          </span>
        ))}
      </div>

      <div className="mt-1 space-y-2.5">
        {seg.habits.map((h) => (
          <div key={h.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className={cn("min-w-0 truncate text-sm", glass ? "pk-fg" : "text-ink")}>{h.name}</span>
              {showScore && h.targetPerWeek !== undefined ? (
                <span className={cn("shrink-0 text-micro tabular-nums", (h.metThisWeek ?? 0) >= h.targetPerWeek ? "text-ok-ink" : "pk-fg-soft")} title="Days met / weekly target">
                  {h.metThisWeek}/{h.targetPerWeek}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {week.days.map((d) => {
                const state = (h.marks[d] ?? "empty") as "empty" | HabitMarkValue;
                const meta = state === "empty" ? null : CELL[state];
                const Icon = meta?.icon;
                const locked = readOnly || (maxDate !== undefined && d > maxDate);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={locked}
                    onClick={() => onMark(h.id, d, NEXT_MARK[state])}
                    aria-label={`${h.name}, ${weekdayInitial(d)} — ${meta?.label ?? "not marked"}${locked ? "" : " (tap to change)"}`}
                    className={
                      glass
                        ? cn(
                            "pk-press pk-cell grid h-9 place-items-center rounded-card",
                            d === today ? "pk-today" : "",
                            locked
                              ? cn(meta ? CELL_GLASS[state as HabitMarkValue] : "", "cursor-default opacity-60")
                              : cn(meta ? CELL_GLASS[state as HabitMarkValue] : "", "pk-row-hover"),
                          )
                        : cn(
                            "press grid h-9 place-items-center rounded-card border transition-colors duration-150 ease-out",
                            d === today ? "ring-1 ring-primary ring-offset-1 ring-offset-surface" : "",
                            locked
                              ? meta
                                ? cn(meta.cls, "cursor-default opacity-90")
                                : "cursor-default border-line bg-bg text-muted opacity-40"
                              : meta
                                ? meta.cls
                                : "border-line bg-surface text-muted hover:bg-hover",
                          )
                    }
                  >
                    {Icon ? <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Edit mode: add/rename/remove segments + habits, set weekly targets. ──── */

function SegmentEditor({ segments, weekParam, personId }: { segments: HabitSegmentDTO[]; weekParam: string | null; personId: string | null }) {
  const { addSegment, renameSegment, deleteSegment, addHabit, updateHabit, deleteHabit } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [newSegment, setNewSegment] = useState("");
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  return (
    <div className="space-y-5">
      {segments.map((seg) => (
        <div key={seg.id} className="rounded-card pk-cell p-3">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => { const name = window.prompt("Rename segment", seg.name)?.trim(); if (name && name !== seg.name) renameSegment.mutate({ id: seg.id, name }, { onError: err }); }}
              className="press flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-semibold pk-fg hover:text-primary-ink"
            >
              <span className="truncate">{seg.name}</span>
              <Pencil className="h-3.5 w-3.5 shrink-0 pk-fg-soft" aria-hidden />
            </button>
            <button type="button" onClick={() => { if (window.confirm(`Remove “${seg.name}” and its habits?`)) deleteSegment.mutate(seg.id, { onError: err }); }} aria-label={`Remove segment ${seg.name}`} className="press grid h-8 w-8 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="space-y-1.5">
            {seg.habits.map((h) => (
              <div key={h.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { const name = window.prompt("Rename habit", h.name)?.trim(); if (name && name !== h.name) updateHabit.mutate({ id: h.id, patch: { name } }, { onError: err }); }}
                  className="min-w-0 flex-1 truncate rounded-card px-2 py-1.5 text-left text-sm pk-fg hover:bg-[color:var(--pk-cell)]"
                >
                  {h.name}
                </button>
                <TargetStepper value={h.targetPerWeek} onChange={(t) => updateHabit.mutate({ id: h.id, patch: { targetPerWeek: t } }, { onError: err })} />
                <button type="button" onClick={() => deleteHabit.mutate(h.id, { onError: err })} aria-label={`Remove habit ${h.name}`} className="press grid h-8 w-8 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            <AddHabit segmentId={seg.id} onAdd={(name) => addHabit.mutate({ segmentId: seg.id, name }, { onError: err })} />
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <input
          value={newSegment}
          onChange={(e) => setNewSegment(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newSegment.trim()) { addSegment.mutate({ name: newSegment.trim() }, { onError: err }); setNewSegment(""); } }}
          placeholder="New segment (e.g. Sleep & Wake)"
          aria-label="New segment name"
          className={cn(inputCls, "h-10 flex-1")}
        />
        <button type="button" onClick={() => { if (newSegment.trim()) { addSegment.mutate({ name: newSegment.trim() }, { onError: err }); setNewSegment(""); } }} aria-label="Add segment" className="press grid h-10 w-10 shrink-0 place-items-center rounded-card bg-primary text-on-primary">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function TargetStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-card pk-cell px-1 py-0.5" title="Weekly target (days)">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label="Lower target" className="press grid h-6 w-6 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] disabled:opacity-30" disabled={value <= 0}>
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className="w-8 text-center text-micro tabular-nums pk-fg">{value}/wk</span>
      <button type="button" onClick={() => onChange(Math.min(7, value + 1))} aria-label="Raise target" className="press grid h-6 w-6 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] disabled:opacity-30" disabled={value >= 7}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

function AddHabit({ segmentId, onAdd }: { segmentId: string; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const add = () => { if (name.trim()) { onAdd(name.trim()); setName(""); } };
  return (
    <div className="flex items-center gap-2 pt-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        placeholder="Add a habit…"
        aria-label={`Add a habit to this segment`}
        data-segment={segmentId}
        className={cn(inputCls, "h-9 flex-1")}
      />
      <button type="button" onClick={add} aria-label="Add habit" className="press grid h-9 w-9 shrink-0 place-items-center rounded-card bg-primary-soft pk-fg hover:bg-[color:var(--pk-cell)]">
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
