"use client";

import { cn } from "@/lib/cn";
import { DATE_STATE_STYLE, DEADLINE_TONE_STYLE, dateState, dateWord, deadlineTone } from "@/lib/dates";
import { STATUS_STYLE } from "@/lib/status";
import type { TaskStatus } from "@/lib/types";

export type ChipTone = "neutral" | "primary" | "ok" | "warn" | "danger" | "info";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-hover text-muted",
  primary: "bg-primary-soft text-primary-ink",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
  info: "bg-info-soft text-info-ink",
};

/** A capsule, 28px tall, 13px text. Soft tint + darker ink. */
export function Chip({
  tone = "neutral",
  children,
  className,
  onClick,
  title,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const cls = cn(
    "inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2.5 text-micro font-medium",
    TONE[tone],
    onClick && "press",
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} title={title}>
        {children}
      </button>
    );
  }
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

/** The four statuses as a pill. */
export function StatusChip({ status, onClick, className }: { status: TaskStatus; onClick?: () => void; className?: string }) {
  const s = STATUS_STYLE[status];
  const cls = cn("inline-flex h-7 shrink-0 items-center rounded-chip px-2.5 text-micro font-medium", s.pill, onClick && "press", className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} aria-label={`Status: ${s.label}`}>
      {s.label}
    </button>
  ) : (
    <span className={cls}>{s.label}</span>
  );
}

/** A task date as a word (Today / Tomorrow / Mon / 3 days late / 12 Sep), tinted by lateness. */
export function DateChip({ iso, status, onClick, className }: { iso: string | null; status: TaskStatus; onClick?: () => void; className?: string }) {
  const state = dateState(iso, status);
  const style = state === "none" ? "border border-dashed border-line text-muted" : DATE_STATE_STYLE[state];
  const label = iso ? dateWord(iso) : "No date";
  const cls = cn("inline-flex h-7 shrink-0 items-center rounded-chip px-2.5 text-micro font-medium", style, onClick && "press", className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} aria-label={`By when: ${label}`}>
      {label}
    </button>
  ) : (
    <span className={cls}>{label}</span>
  );
}

/** A project deadline: green, amber inside a week, red once passed. */
export function DeadlineChip({ deadline, done = false, className }: { deadline: string | null; done?: boolean; className?: string }) {
  const tone = deadlineTone(deadline, done);
  if (!deadline || !tone) {
    return <span className={cn("inline-flex h-7 items-center rounded-chip border border-dashed border-line px-2.5 text-micro text-muted", className)}>No deadline</span>;
  }
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center rounded-chip px-2.5 text-micro font-medium", DEADLINE_TONE_STYLE[tone], className)}>
      {done ? "Done" : `Due ${dateWord(deadline)}`}
    </span>
  );
}
