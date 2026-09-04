"use client";

import { cn } from "@/lib/cn";
import type { ProjectDTO } from "@/lib/types";

/**
 * The calendar's project filter: "All projects", then one capsule per
 * project. `selected` null means every project; an array (possibly empty) is
 * an explicit set. Tapping a project while on "All" reads as "just hide this
 * one"; re-selecting every project collapses back to "All". The parent keeps
 * the choice between visits.
 */
export function ProjectFilter({
  projects,
  selected,
  onSelected,
}: {
  projects: ProjectDTO[];
  selected: string[] | null;
  onSelected: (next: string[] | null) => void;
}) {
  const isAll = selected === null;
  const has = (id: string) => isAll || selected.includes(id);

  const toggle = (id: string) => {
    if (isAll) {
      onSelected(projects.map((p) => p.id).filter((x) => x !== id));
      return;
    }
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onSelected(next.length === projects.length ? null : next);
  };

  if (projects.length === 0) return null;

  return (
    <div role="group" aria-label="Show which projects" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button
        type="button"
        onClick={() => onSelected(null)}
        aria-pressed={isAll}
        className={cn(
          "press hit-40 flex h-9 shrink-0 items-center rounded-chip px-3.5 text-sm font-medium",
          isAll ? "bg-ink text-on-ink" : "bg-surface text-muted shadow-e1 hover:text-ink",
        )}
      >
        All projects
      </button>

      {projects.map((p) => {
        const active = has(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            aria-pressed={active}
            className={cn(
              "press hit-40 flex h-9 shrink-0 items-center gap-2 rounded-chip px-3 text-sm",
              active ? "bg-surface font-medium text-ink shadow-e1" : "bg-hover text-muted hover:text-ink",
            )}
          >
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", !active && "opacity-40")} style={{ background: p.color }} aria-hidden />
            <span className="max-w-[10rem] truncate">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
