"use client";

import { ChevronRight, FolderClosed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { DepartmentDTO } from "@/lib/types";

export type DepartmentSummary = { department: DepartmentDTO; count: number; behind: number };

/**
 * The first level of Projects: one row per department — a folder mark (the
 * same for every department, so a department never reads like a person), the
 * name, how many projects live here and how many are behind. Tap to open.
 * A department with nothing in it reads muted so the eye lands on the rest.
 */
export function DepartmentList({ items, onOpen }: { items: DepartmentSummary[]; onOpen: (d: DepartmentDTO) => void }) {
  return (
    <Card as="div" className="divide-y divide-line">
      <ul className="list-none">
        {items.map(({ department: d, count, behind }) => (
          <li key={d.id} className="border-t border-line first:border-t-0">
            <button
              type="button"
              onClick={() => onOpen(d)}
              className="press flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-left"
              aria-label={`${d.name}, ${count === 0 ? "no projects yet" : `${count} ${count === 1 ? "project" : "projects"}`}${behind > 0 ? `, ${behind} behind` : ""}`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-input bg-surface-2" aria-hidden>
                <FolderClosed className="h-5 w-5 text-muted" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-row", count === 0 ? "text-muted" : "text-ink")}>{d.name}</span>
                <span className="block truncate text-sm text-muted">
                  {count === 0 ? "No projects yet" : `${count} ${count === 1 ? "project" : "projects"}`}
                  {behind > 0 ? (
                    <>
                      {" · "}
                      <span className="text-danger-ink">{behind} behind</span>
                    </>
                  ) : null}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
