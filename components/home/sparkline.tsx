"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Fourteen days of completions. Hand-rolled polyline — a charting library for
 * forty pixels of trend would be absurd. A flat run of zeros draws a flat line
 * on the baseline rather than collapsing to nothing.
 */
export function Sparkline({
  values,
  color,
  width = 132,
  height = 30,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const reduce = useReducedMotion();
  if (values.length === 0) return null;

  const max = Math.max(...values, 1);
  const pad = 3;
  const usableH = height - pad * 2;
  const step = values.length > 1 ? width / (values.length - 1) : width;

  const points = values.map((value, i) => {
    const x = i * step;
    const y = pad + usableH * (1 - value / max);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const total = values.reduce((a, b) => a + b, 0);
  const line = points.join(" ");
  const area = `${points.join(" ")} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      aria-label={`${total} completed in the last ${values.length} days`}
      preserveAspectRatio="none"
    >
      <polygon points={area} fill={color} opacity={0.1} />
      <motion.polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}
