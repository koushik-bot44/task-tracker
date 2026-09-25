"use client";

import { GraduationCap } from "lucide-react";
import type { MentorReportDTO } from "@/lib/types";
import { prettyDate } from "./shared";

/**
 * What the tutors and coaches sent (2026-09-25). One glass row per day report:
 * who, what subject, when; what was covered; the homework (weighted so a parent
 * finds it fast); a note when there is one. Read-only on the parent's side — the
 * tutor writes these from their own screen.
 */
export function ReportsSection({ reports, title, emptyText = "No reports this week." }: { reports: MentorReportDTO[]; title: string; emptyText?: string }) {
  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
        <h2 className="font-display text-lg font-semibold pk-fg">{title}</h2>
      </div>
      {reports.length === 0 ? (
        <p className="py-3 text-center text-sm pk-fg-soft">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-card pk-cell px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold pk-fg">
                  {r.subject} <span className="font-normal pk-fg-soft">· {r.mentorName}</span>
                </p>
                <span className="shrink-0 text-micro pk-fg-soft">{prettyDate(r.date)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-sm pk-fg">{r.covered}</p>
              {r.homework ? <p className="mt-1.5 break-words text-sm font-medium pk-fg">Homework: {r.homework}</p> : null}
              {r.note ? <p className="mt-1 break-words text-sm pk-fg-soft">{r.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
