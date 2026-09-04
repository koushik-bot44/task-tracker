"use client";

import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Face } from "@/components/ui/face";
import { cn } from "@/lib/cn";
import type { DepartmentDTO } from "@/lib/types";

export type DepartmentSummary = { department: DepartmentDTO; count: number; behind: number };

/**
 * The first level of Projects: one row per department — the head's face, the
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
              <Face name={d.hodName ?? d.name} title={d.hodName ? `${d.hodName} looks after ${d.name}` : d.name} />
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
