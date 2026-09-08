"use client";

import { cn } from "@/lib/cn";
import type { ProjectDTO } from "@/lib/types";

/**
 * The calendar's project filter: "All projects", then one capsule per
 * project. `selected` null means every project; an array is an explicit set.
 *
 * Tapping a project shows THAT project (owner, 2026-09-08 — it used to mean
 * "hide this one", which is the opposite of what anyone expects). Tap another
 * to add it; tap the last one again, or "All projects", to go back to
 * everything. The parent keeps the choice between visits.
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
      onSelected([id]);
      return;
    }
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    // Nothing left, or everything picked, both mean "all projects".
    onSelected(next.length === 0 || next.length === projects.length ? null : next);
  };

  if (projects.length === 0) return null;

  return (
    /* Wrapped, not a sideways scroll: on a phone the row cut off after two
       projects and the rest looked as though they did not exist (owner,
       2026-09-08). */
    <div role="group" aria-label="Show which projects" className="flex flex-wrap gap-2 pb-1">
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
            <span className="max-w-[10rem] truncate">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
