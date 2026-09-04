"use client";

import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RoutineSummaryDTO } from "@/lib/types";

/** Score % from a met/target pair, or null when there is no target. */
const pct = (met: number, target: number) => (target > 0 ? Math.round((met / target) * 100) : null);
/** Gentle text colour — soft green when strong, soft amber when low. Never red. */
const scoreText = (p: number | null) => (p === null ? "pk-fg-soft" : p >= 80 ? "text-ok-ink" : p >= 50 ? "pk-fg" : "text-warn-ink");
/** Calm bar fill — soft green when strong, soft blue otherwise (never an alarming fill). */
const barFill = (p: number | null) => (p !== null && p >= 80 ? "bg-chart-done" : "bg-chart-open");

/**
 * The Weekly Summary sub-tab (phase 38) — MANAGER only. A calm projection of the
 * SAME per-segment tallies the tracker grid shows (daysMet = segment.metThisWeek,
 * target = segment.targetThisWeek), plus the overall total and the week's
 * non-negotiable violations. Information, not a verdict — no harsh red scoreboard.
 */
export function SummaryView({ summary, weekLabel }: { summary: RoutineSummaryDTO; weekLabel: string }) {
  const overall = pct(summary.overallDaysMet, summary.overallTarget);

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold pk-fg">Weekly summary</h2>
        <span className="shrink-0 text-micro pk-fg-soft">{weekLabel}</span>
      </div>
      <p className="mb-4 text-micro pk-fg-soft">How the week is going — information, not a verdict.</p>

      {summary.segments.length === 0 ? (
        <p className="py-6 text-center text-sm pk-fg-soft">No habits yet — add some in the Tracker.</p>
      ) : (
        <div className="space-y-3">
          {summary.segments.map((s) => {
            const p = pct(s.daysMet, s.target);
            return (
              <div key={s.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm pk-fg">{s.name}</span>
                  <span className="shrink-0 text-micro tabular-nums pk-fg-soft">
                    {s.daysMet}/{s.target} · <span className={cn("font-semibold", scoreText(p))}>{p === null ? "—" : `${p}%`}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[color:var(--pk-cell)]" role="presentation">
                  <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", barFill(p))} style={{ width: `${p === null ? 0 : Math.min(100, p)}%` }} />
                </div>
              </div>
            );
          })}

          <div className="mt-1 border-t border-line pt-3">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold pk-fg">Overall</span>
              <span className="shrink-0 text-sm tabular-nums pk-fg-soft">
                {summary.overallDaysMet}/{summary.overallTarget} · <span className={cn("font-bold", scoreText(overall))}>{overall === null ? "—" : `${overall}%`}</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[color:var(--pk-cell)]" role="presentation">
              <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", barFill(overall))} style={{ width: `${overall === null ? 0 : Math.min(100, overall)}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-3 rounded-card pk-cell p-3">
        <ShieldAlert className={cn("mt-0.5 h-5 w-5 shrink-0", summary.missed > 0 ? "text-warn-ink" : "pk-fg-soft")} strokeWidth={2} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm pk-fg">
            Non-negotiables:{" "}
            <span className={cn("font-semibold", summary.missed > 0 ? "text-warn-ink" : "text-ok-ink")}>
              {summary.missed === 0 ? "on track" : `${summary.missed} missed`}
            </span>
          </p>
          <p className="mt-0.5 text-micro pk-fg-soft">Scheduled days already past that weren’t marked done.</p>
        </div>
      </div>
    </section>
  );
}
