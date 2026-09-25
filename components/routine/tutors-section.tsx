"use client";

import { GraduationCap } from "lucide-react";
import type { MentorReportDTO } from "@/lib/types";
import { prettyDate, weekdayShort } from "./shared";

/**
 * The Tutors tab (2026-09-25): everything the tutors and coaches punched in,
 * organised by day, newest day first — subject and who, what was covered, the
 * homework, their line for the parents. The Summary carries only today's.
 */
export function TutorsSection({ reports, loading, today }: { reports: MentorReportDTO[]; loading: boolean; today: string }) {
  const byDay = new Map<string, MentorReportDTO[]>();
  for (const r of reports) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold pk-fg">Tutors&rsquo; reports</h2>
          <p className="mt-0.5 text-micro pk-fg-soft">What each tutor or coach punched in after a session, day by day.</p>
        </div>
      </div>
      {loading ? (
        <p className="py-2 text-sm pk-fg-soft">Loading…</p>
      ) : days.length === 0 ? (
        <p className="py-2 text-sm pk-fg-soft">No reports yet.</p>
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d}>
              <h3 className="mb-1.5 text-sm font-semibold pk-fg">{d === today ? "Today" : `${weekdayShort(d)} ${prettyDate(d)}`}</h3>
              <ul className="space-y-1.5">
                {byDay.get(d)!.map((r) => (
                  <li key={r.id} className="rounded-card pk-cell px-3 py-2.5">
                    <p className="min-w-0 truncate text-sm font-semibold pk-fg">
                      {r.subject} <span className="font-normal pk-fg-soft">· {r.mentorName}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-sm pk-fg">{r.covered}</p>
                    {r.homework ? <p className="mt-1.5 break-words text-sm font-medium pk-fg">Homework: {r.homework}</p> : null}
                    {r.note ? <p className="mt-1 break-words text-sm pk-fg-soft">{r.note}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
