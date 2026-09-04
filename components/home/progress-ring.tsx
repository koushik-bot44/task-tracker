"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * One of the app's two aesthetic signatures. Hand-rolled SVG: the arc animates
 * by stroke-dashoffset, and the percentage is the one place Fraunces earns its
 * keep outside a page title.
 */
export function ProgressRing({
  done,
  total,
  color,
  size = 76,
  stroke = 6,
}: {
  done: number;
  total: number;
  color: string;
  size?: number;
  stroke?: number;
}) {
  const reduce = useReducedMotion();
  const ratio = total > 0 ? done / total : 0;
  const percent = Math.round(ratio * 100);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${done} of ${total} leaf tasks done, ${percent} percent`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduce ? circumference * (1 - ratio) : circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={{ duration: reduce ? 0 : 0.75, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="font-display text-lg font-semibold tabular-nums text-ink">
          {percent}
          <span className="text-xs text-muted">%</span>
        </span>
      </span>
    </div>
  );
}
