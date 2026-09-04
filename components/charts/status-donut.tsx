"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { STATUS_STYLE } from "@/lib/status";
import { STATUSES, STATUS_LABEL, type Status } from "@/lib/types";

/**
 * Hand-rolled SVG, no chart library — a standing constraint, and at this size
 * a dependency would weigh more than the maths.
 *
 * Segments are stroke-dasharray arcs on one circle rather than paths: an arc
 * is `visible length, rest of circumference` with an offset, which means no
 * trigonometry and no seams between neighbours.
 *
 * Colour comes from STATUS_STYLE so a donut, a chip and a board column can
 * never disagree about what "on hold" looks like.
 */

const SIZE = 132;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Segment fills use the VIVID value of each hue, not the -ink one.
 *
 * The two-value law: a hue ships vivid for fills and -ink for text, because a
 * fill needs 3:1 and text needs 4.5:1. I reached for -ink here and the charts
 * came out muddy — worse, BACKLOG rendered in --muted, the heaviest colour on
 * the wheel, so a brand-new tool with six untouched tasks drew a big dark ring
 * and read as a tool in trouble. The states that mean "nothing has happened"
 * now recede, and the states that mean something carry the colour.
 *
 * The legend dots keep the -ink values (see STATUS_STYLE.dot) — a 8px circle
 * is a glyph, not a fill, and owes the higher ratio.
 */
const STATUS_VAR: Record<Status, string> = {
  BACKLOG: "var(--chart-idle)",
  PLANNED: "var(--info)",
  IN_PROGRESS: "var(--primary)",
  ON_HOLD: "var(--warn)",
  BLOCKED: "var(--danger)",
  DONE: "var(--ok)",
  CANCELLED: "var(--line)",
};

export function StatusDonut({
  counts,
  selected,
  onSelect,
  className,
}: {
  counts: Record<Status, number>;
  /** Highlights one status and dims the rest. */
  selected?: Status | null;
  onSelect?: (status: Status | null) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  // Pointer-following value label — "Done: 7" as you sweep the ring. Coords are
  // relative to the ring box, computed from its rect on move.
  const [hover, setHover] = useState<{ status: Status; x: number; y: number } | null>(null);
  const shown = STATUSES.filter((s) => (counts[s] ?? 0) > 0);
  const total = shown.reduce((n, s) => n + counts[s], 0);

  if (total === 0) {
    return (
      <div className={cn("flex flex-col items-center gap-2", className)}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--line)"
            strokeWidth={STROKE}
          />
        </svg>
        <p className="text-micro text-muted">No tasks yet</p>
      </div>
    );
  }

  let offset = 0;
  const segments = shown.map((status) => {
    const value = counts[status];
    const length = (value / total) * C;
    const seg = { status, value, length, offset };
    offset += length;
    return seg;
  });

  const done = counts.DONE ?? 0;
  const pct = Math.round((done / total) * 100);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div ref={boxRef} className="relative" onMouseLeave={() => setHover(null)}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${pct}% done. ${shown
            .map((s) => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`)
            .join(", ")}.`}
        >
          {/* Rotated so the first segment starts at twelve o'clock. */}
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="var(--line)"
              strokeWidth={STROKE}
              opacity={0.35}
            />
            {segments.map((seg) => {
              const dim = selected != null && selected !== seg.status;
              return (
                <motion.circle
                  key={seg.status}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={STATUS_VAR[seg.status]}
                  strokeWidth={STROKE}
                  strokeLinecap="butt"
                  strokeDasharray={`${seg.length} ${C - seg.length}`}
                  strokeDashoffset={-seg.offset}
                  initial={reduce ? false : { opacity: 0 }}
                  /* 0.2 erased the ring entirely while a filter was on, so the
                     chart stopped showing proportion at exactly the moment you
                     were studying one slice of it. Dimmed, not deleted. */
                  animate={{ opacity: dim ? 0.32 : 1 }}
                  transition={{
                    duration: reduce ? 0 : 0.6,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={onSelect ? "cursor-pointer" : undefined}
                  onMouseMove={(e) => {
                    const rect = boxRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setHover({
                      status: seg.status,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    });
                  }}
                  onClick={
                    onSelect
                      ? () => onSelect(selected === seg.status ? null : seg.status)
                      : undefined
                  }
                />
              );
            })}
          </g>
        </svg>

        {/* The number people actually came for, in the hole. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-display text-page-lg font-bold tabular-nums text-ink">
              {pct}
              <span className="text-sm font-semibold text-muted">%</span>
            </p>
            <p className="text-micro text-muted">done</p>
          </div>
        </div>

        {hover ? (
          <div
            className="pointer-events-none absolute z-tooltip -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-card bg-ink px-2 py-1 text-micro font-medium text-surface shadow-e2"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            {STATUS_LABEL[hover.status]}:{" "}
            <span className="tabular-nums">{counts[hover.status]}</span>
          </div>
        ) : null}
      </div>

      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {shown.map((status) => {
          const active = selected === status;
          return (
            <li key={status}>
              <button
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(active ? null : status)}
                aria-pressed={onSelect ? active : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-chip px-1.5 py-0.5 text-micro",
                  onSelect && "press",
                  active ? "bg-hover font-semibold text-ink" : "text-muted",
                )}
              >
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_STYLE[status].dot)}
                  aria-hidden
                />
                {STATUS_LABEL[status]}
                <span className="tabular-nums">{counts[status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
