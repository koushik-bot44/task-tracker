"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Completions per week — a hand-rolled SVG bar chart, no chart library (the
 * standing constraint). Bars animate up on mount and hold at full height under
 * reduced-motion. A flat run of zeros draws flush hairline stubs on the
 * baseline rather than vanishing, so an empty department still reads as "a
 * chart with nothing in it" instead of a broken box.
 */
export function WeekBars({
  values,
  color,
  className,
}: {
  values: number[];
  color: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const width = 320;
  const height = 72;
  const pad = 4;
  const n = values.length;
  const max = Math.max(...values, 1);
  const slot = (width - pad * 2) / n;
  const barW = Math.max(6, slot * 0.62);
  const usableH = height - pad * 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Completions across the last ${n} weeks: ${values.join(", ")}`}
    >
      {/* baseline */}
      <line
        x1={pad}
        y1={height - pad}
        x2={width - pad}
        y2={height - pad}
        stroke="var(--line)"
        strokeWidth={1}
      />
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * usableH);
        const x = pad + slot * i + (slot - barW) / 2;
        const y = height - pad - h;
        const isLast = i === n - 1;
        return (
          <motion.rect
            key={i}
            x={x}
            width={barW}
            rx={3}
            fill={color}
            opacity={isLast ? 1 : 0.55}
            initial={reduce ? { y, height: h } : { y: height - pad, height: 0 }}
            animate={{ y, height: h }}
            transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : i * 0.04, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
    </svg>
  );
}
