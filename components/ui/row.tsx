"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * A 56px row: something on the left (a checkbox or a Face), a title that gets
 * the room, something on the right (a chip or a Face). The whole row is the
 * tap target unless a child stops propagation.
 */
export function Row({
  left,
  right,
  children,
  onClick,
  href,
  className,
  dimmed = false,
  ariaLabel,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  dimmed?: boolean;
  ariaLabel?: string;
}) {
  const inner = (
    <>
      {left ? <span className="flex shrink-0 items-center">{left}</span> : null}
      <span className={cn("min-w-0 flex-1 truncate text-row", dimmed ? "text-muted" : "text-ink")}>{children}</span>
      {right ? <span className="flex shrink-0 items-center gap-2">{right}</span> : null}
    </>
  );
  const cls = cn("flex min-h-[56px] w-full items-center gap-3 px-4 text-left", (onClick || href) && "press rounded-card", className);
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** A round 24px checkbox that reads done/not done at a glance. */
export function Check({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn("hit-40 grid h-11 w-11 shrink-0 place-items-center rounded-full", className)}
    >
      <span
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full border-2 transition-colors duration-150 ease-out",
          checked ? "border-ok bg-ok" : "border-muted bg-transparent",
        )}
      >
        <svg viewBox="0 0 20 20" className={cn("h-3.5 w-3.5 text-on-primary transition-opacity duration-150", checked ? "opacity-100" : "opacity-0")} aria-hidden>
          <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
