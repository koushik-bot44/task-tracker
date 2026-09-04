"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ProjectDTO } from "@/lib/types";

/**
 * Calendar filter. `selected` null means All tools; an array (possibly empty)
 * is an explicit set. A separate "Global events" toggle hides all-hands events
 * without affecting the tool selection. Persistence lives in the parent.
 */
export function ProjectFilter({
  projects,
  selected,
  onSelected,
  showGlobal,
  onShowGlobal,
}: {
  projects: ProjectDTO[];
  selected: string[] | null;
  onSelected: (next: string[] | null) => void;
  showGlobal: boolean;
  onShowGlobal: (next: boolean) => void;
}) {
  const isAll = selected === null;
  const has = (id: string) => isAll || selected.includes(id);

  const toggle = (id: string) => {
    if (isAll) {
      // Leaving All: start an explicit set of every tool EXCEPT this one, so
      // clicking one chip in All-mode reads as "hide this one".
      onSelected(projects.map((p) => p.id).filter((x) => x !== id));
      return;
    }
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    // Re-selecting everything collapses back to the tidy All state.
    onSelected(next.length === projects.length ? null : next);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSelected(null)}
        aria-pressed={isAll}
        className={cn(
          "press flex h-8 items-center rounded-chip px-3 text-micro font-medium",
          isAll ? "bg-ink text-surface" : "bg-hover text-muted hover:text-ink",
        )}
      >
        All tools
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
              "press flex h-8 items-center gap-1.5 rounded-chip border px-2.5 text-micro",
              active
                ? "border-line bg-surface font-medium text-ink"
                : "border-transparent bg-hover text-muted hover:text-ink",
            )}
          >
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", !active && "opacity-40")}
              style={{ background: p.color }}
              aria-hidden
            />
            <span className="max-w-[9rem] truncate">{p.name}</span>
          </button>
        );
      })}

      <span className="mx-1 h-5 w-px bg-line" aria-hidden />

      <button
        type="button"
        onClick={() => onShowGlobal(!showGlobal)}
        aria-pressed={showGlobal}
        className={cn(
          "press flex h-8 items-center gap-1.5 rounded-chip px-2.5 text-micro font-medium",
          showGlobal ? "bg-primary-soft text-primary-ink" : "bg-hover text-muted hover:text-ink",
        )}
      >
        <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        All-hands
      </button>
    </div>
  );
}
