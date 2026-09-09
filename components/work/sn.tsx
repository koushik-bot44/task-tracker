"use client";

import { cn } from "@/lib/cn";

/**
 * The plain, dense look of a service-desk form and list: 13px text, 1px
 * lines, no shadows, blue links, labels on the left. Every Work screen is
 * built from these few pieces.
 */
export const snInput = "h-8 w-full rounded-[3px] border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-primary disabled:bg-hover disabled:text-muted";
export const snButton = "press inline-flex h-8 shrink-0 items-center gap-1 rounded-[3px] border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-hover disabled:opacity-40";
export const snPrimary = "press inline-flex h-8 shrink-0 items-center gap-1 rounded-[3px] bg-primary px-3 text-[13px] font-medium text-on-primary hover:opacity-95 disabled:opacity-40";
export const snLink = "text-primary-ink hover:underline";

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border border-line bg-surface", className)}>{children}</div>;
}

export function PanelHeader({ title, right, className }: { title: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[40px] flex-wrap items-center gap-2 border-b border-line bg-hover px-3 py-1", className)}>
      <div className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{title}</div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** A form row: label on the left, control on the right. */
export function FormRow({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-3 px-3 py-1.5">
      <span className={cn("text-right text-[13px] text-muted", required && "before:mr-1 before:text-danger-ink before:content-['*']")}>{label}</span>
      <div className="min-w-0 text-[13px] text-ink">{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex items-end gap-1 border-b border-line px-2">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn("press -mb-px h-9 px-3 text-[13px] font-medium", value === t.value ? "border-b-2 border-primary text-ink" : "text-muted hover:text-ink")}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1 text-muted">({t.count})</span> : null}
        </button>
      ))}
    </div>
  );
}
