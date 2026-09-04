"use client";

import { cn } from "@/lib/cn";

/** [All] [Mine] [Behind] — a segmented control, 44px tall. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex h-11 items-center gap-1 rounded-input bg-hover p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium",
              active ? "bg-surface text-ink shadow-e1" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
            {o.count !== undefined && o.count > 0 ? <span className="text-micro tabular-nums text-muted">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
