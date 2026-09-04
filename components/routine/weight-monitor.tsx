"use client";

import { Plus, TrendingDown, TrendingUp, Minus as MinusIcon, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { MonthlyWeightDTO, WeightEntryDTO } from "@/lib/types";
import { inputCls, prettyDate } from "./shared";

const monthShort = (m: string) => new Date(`${m}-01T00:00:00.000Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const monthLong = (m: string) => new Date(`${m}-01T00:00:00.000Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The weight monitor — manager-only (the tracked person never sees it; weight
 * lives ONLY here, in the Routine tab). A calm, minimal trend with two views:
 * "Recent" (each logged entry) and "Monthly" (one representative point per IST
 * calendar month — the latest entry that month — so the manager reads this month
 * vs last). Both use a hand-rolled min–max sparkline (no chart library).
 */
export function WeightMonitor({
  entries,
  monthly,
  today,
  weekParam,
  personId,
  readOnly = false,
}: {
  entries: WeightEntryDTO[];
  monthly: MonthlyWeightDTO[];
  today: string;
  weekParam: string | null;
  personId: string | null;
  readOnly?: boolean;
}) {
  const { addWeight, deleteWeight } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [view, setView] = useState<"recent" | "monthly">("recent");
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState("");
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const add = () => {
    const value = Number(kg);
    if (!Number.isFinite(value) || value <= 0) return toast({ message: "Enter a weight in kg.", tone: "danger" });
    addWeight.mutate({ date, weightKg: value }, { onSuccess: () => { setKg(""); setAdding(false); }, onError: err });
  };

  const hasAny = sorted.length > 0;

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold pk-fg">Weight</h2>
        {readOnly ? null : (
          <button type="button" onClick={() => setAdding((v) => !v)} className="press shrink-0 rounded-card px-3 py-1.5 text-micro font-medium pk-fg hover:bg-[color:var(--pk-cell)]">
            {adding ? "Close" : "Log"}
          </button>
        )}
      </div>

      {hasAny ? (
        <div className="mb-4 pk-glass inline-flex rounded-card p-1" role="tablist" aria-label="Weight view">
          {(["recent", "monthly"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("press rounded-card px-3 py-1 text-micro font-medium capitalize transition-colors duration-150 ease-out", view === v ? "pk-tab-active" : "pk-tab pk-tab-hover")}
            >
              {v}
            </button>
          ))}
        </div>
      ) : null}

      {adding && !readOnly ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Weight date" className={cn(inputCls, "h-10 w-auto flex-1")} />
          <input type="number" inputMode="decimal" step="0.1" min="0" value={kg} onChange={(e) => setKg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="kg" aria-label="Weight in kilograms" className={cn(inputCls, "h-10 w-24")} />
          <button type="button" onClick={add} aria-label="Save weight" className="press grid h-10 w-10 shrink-0 place-items-center rounded-card bg-primary text-on-primary"><Plus className="h-4 w-4" aria-hidden /></button>
        </div>
      ) : null}

      {!hasAny ? (
        <p className="py-4 text-center text-sm pk-fg-soft">{readOnly ? "No weight logged yet." : "No weight logged yet. Tap “Log” to add the first."}</p>
      ) : view === "recent" ? (
        <RecentView sorted={sorted} onDelete={readOnly ? undefined : (id) => deleteWeight.mutate(id, { onError: err })} />
      ) : (
        <MonthlyView monthly={monthly} />
      )}
    </section>
  );
}

function RecentView({ sorted, onDelete }: { sorted: WeightEntryDTO[]; onDelete?: (id: string) => void }) {
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2] ?? null;
  const delta = prev ? Math.round((latest.weightKg - prev.weightKg) * 10) / 10 : null;

  return (
    <>
      <Headline value={latest.weightKg} sub={prettyDate(latest.date)} delta={delta} deltaTitle="Change since the previous entry" />
      {sorted.length >= 2 ? <MiniTrend values={sorted.map((e) => e.weightKg)} /> : <p className="mt-3 text-micro pk-fg-soft">Log another to see the trend.</p>}
      <ul className="mt-4 space-y-1 border-t border-line pt-3">
        {[...sorted].reverse().slice(0, 6).map((e) => (
          <li key={e.id} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 tabular-nums pk-fg">{e.weightKg} kg</span>
            <span className="min-w-0 flex-1 truncate text-micro pk-fg-soft">{prettyDate(e.date)}</span>
            {onDelete ? (
              <button type="button" onClick={() => onDelete(e.id)} aria-label={`Delete ${e.weightKg} kg on ${prettyDate(e.date)}`} className="press grid h-6 w-6 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function MonthlyView({ monthly }: { monthly: MonthlyWeightDTO[] }) {
  const current = monthly[monthly.length - 1] ?? null;
  const last = monthly[monthly.length - 2] ?? null;
  const delta = current && last ? Math.round((current.weightKg - last.weightKg) * 10) / 10 : null;

  if (!current) return <p className="py-4 text-center text-sm pk-fg-soft">Not enough history yet for a monthly view.</p>;

  return (
    <>
      <Headline value={current.weightKg} sub={monthLong(current.month)} delta={delta} deltaTitle="Change since last month" />
      {monthly.length >= 2 ? (
        <MiniTrend values={monthly.map((m) => m.weightKg)} labels={monthly.map((m) => monthShort(m.month))} />
      ) : (
        <p className="mt-3 text-micro pk-fg-soft">One more month will show the progression.</p>
      )}
      <ul className="mt-4 space-y-1 border-t border-line pt-3">
        {[...monthly].reverse().map((m) => (
          <li key={m.month} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 tabular-nums pk-fg">{m.weightKg} kg</span>
            <span className="min-w-0 flex-1 truncate text-micro pk-fg-soft">{monthLong(m.month)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Headline({ value, sub, delta, deltaTitle }: { value: number; sub: string; delta: number | null; deltaTitle: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="font-display text-3xl font-bold tabular-nums pk-fg">
          {value}
          <span className="ml-1 text-base font-medium pk-fg-soft">kg</span>
        </p>
        <p className="mt-0.5 text-micro pk-fg-soft">{sub}</p>
      </div>
      {delta !== null ? (
        <span
          className={cn(
            "flex items-center gap-1 rounded-card px-2.5 py-1 text-sm font-medium",
            delta === 0 ? "pk-cell" : delta > 0 ? "bg-warn-soft text-warn-ink" : "bg-ok-soft text-ok-ink",
          )}
          title={deltaTitle}
        >
          {delta === 0 ? <MinusIcon className="h-4 w-4" aria-hidden /> : delta > 0 ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}
          {delta > 0 ? `+${delta}` : delta} kg
        </span>
      ) : null}
    </div>
  );
}

/** Hand-rolled min–max sparkline so a narrow weight band still reads as a trend.
    Optional month labels are placed evenly under the line. */
function MiniTrend({ values, labels }: { values: number[]; labels?: string[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 280;
  const height = 56;
  const pad = 6;
  const usableH = height - pad * 2;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(pad + usableH * (1 - (v - min) / span)).toFixed(1)}`);
  const line = points.join(" ");
  const area = `${line} ${width},${height} 0,${height}`;
  const last = points[points.length - 1].split(",");
  // Thin labels so at most ~6 show, evenly spaced, first + last always present.
  const shownLabels = labels
    ? labels.map((l, i) => (labels.length <= 6 || i === 0 || i === labels.length - 1 || i % Math.ceil(labels.length / 6) === 0 ? l : ""))
    : null;

  return (
    <div className="mt-3 rounded-card pk-cell p-2">
      <div className="overflow-hidden">
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Weight trend over ${values.length} points, ${min}–${max} kg`} preserveAspectRatio="none" className="block">
          <polygon points={area} fill="var(--primary)" opacity={0.08} />
          <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={last[0]} cy={last[1]} r={3} fill="var(--primary)" />
        </svg>
      </div>
      {shownLabels ? (
        <div className="mt-1 flex justify-between px-0.5">
          {shownLabels.map((l, i) => (
            <span key={i} className="text-micro leading-none pk-fg-soft">{l}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
