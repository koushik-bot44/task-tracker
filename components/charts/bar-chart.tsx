"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/cn";

/**
 * Two hand-rolled bar charts. Both are plain divs with animated widths or
 * heights rather than SVG paths — a bar is a rectangle, and a rectangle does
 * not need a coordinate system.
 *
 * Data reveals may run to 750ms (the motion law's exception for charts);
 * reduced motion gets the final state immediately.
 */

/** Vertical bars — completions per week. */
export function WeeklyBars({
  data,
  className,
}: {
  data: Array<{ label: string; value: number; title: string }>;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...data.map((d) => d.value));
  const empty = data.every((d) => d.value === 0);

  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-32 items-end gap-1.5">
        {data.map((d, i) => (
          <Tooltip key={d.label} content={d.title} className="flex-1">
            <span className="flex h-32 w-full flex-col justify-end">
              <motion.span
                className="block w-full rounded-t-[4px] bg-primary"
                style={{ minHeight: 2 }}
                initial={reduce ? false : { height: 0 }}
                animate={{ height: `${(d.value / max) * 100}%` }}
                transition={{
                  duration: reduce ? 0 : 0.6,
                  delay: reduce ? 0 : i * 0.03,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </span>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 truncate text-center text-[10px] text-muted"
          >
            {d.label}
          </span>
        ))}
      </div>
      {empty ? (
        <p className="mt-2 text-center text-micro text-muted">
          Nothing completed in this window yet.
        </p>
      ) : null}
    </div>
  );
}

/** Horizontal stacked bars — open vs done per person. */
export function WorkloadBars({
  data,
  selected,
  onSelect,
  className,
}: {
  data: Array<{ userId: string | null; name: string; open: number; done: number }>;
  /* `undefined` means no filter; `null` means the Unassigned bucket is the
     filter. Collapsing those two made the Unassigned row render as selected
     the moment the page loaded, because null === null. */
  selected?: string | null | undefined;
  onSelect?: (userId: string | null) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...data.map((d) => d.open + d.done));

  // A lone "Unassigned" bar tells you nothing about who is carrying load, so a
  // tool with no real assignees gets a friendly nudge instead of a bar.
  if (!data.some((d) => d.userId !== null)) {
    return (
      <p className={cn("text-sm text-muted", className)}>
        No one assigned yet — assign tasks to see workload.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {data.map((d, i) => {
        // `null` is the Unassigned bucket, and it is selectable too — "what is
        // nobody holding?" is one of the more useful questions here.
        const key = d.userId ?? "__unassigned";
        const active = selected !== undefined && selected === d.userId;
        const total = d.open + d.done;
        return (
          <button
            key={key}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(active ? null : d.userId)}
            aria-pressed={onSelect ? active : undefined}
            title={`${d.name}: ${d.done} done · ${d.open} open`}
            className={cn(
              "block w-full rounded-card px-2 py-1.5 text-left",
              onSelect && "press",
              active && "bg-hover",
            )}
          >
            <span className="flex items-baseline gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-micro",
                  d.userId ? "text-ink" : "italic text-muted",
                  active && "font-semibold",
                )}
              >
                {d.name}
              </span>
              <span className="shrink-0 text-micro tabular-nums text-muted">
                {d.done} of {total} done
              </span>
            </span>
            <span className="mt-1 flex h-2.5 w-full overflow-hidden rounded-chip bg-hover">
              {/* Calm chart fills (--chart-done / --chart-open), an owner call:
                  quieter than the vivid --ok/--primary so the bar stops
                  out-shouting the page, still solid fills so both halves read.
                  The legend below uses the same two colours, honestly. */}
              <motion.span
                className="block h-full bg-chart-done"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(d.done / max) * 100}%` }}
                transition={{
                  duration: reduce ? 0 : 0.65,
                  delay: reduce ? 0 : i * 0.04,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
              <motion.span
                className="block h-full bg-chart-open"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(d.open / max) * 100}%` }}
                transition={{
                  duration: reduce ? 0 : 0.65,
                  delay: reduce ? 0 : i * 0.04 + 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </span>
          </button>
        );
      })}
      <p className="flex items-center gap-3 px-2 text-micro text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-chart-done" aria-hidden />
          done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-chart-open" aria-hidden />
          open
        </span>
      </p>
    </div>
  );
}
