"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { dateWord } from "@/lib/dates";
import type { CalendarEventDTO } from "@/lib/types";

/**
 * One meeting on Today: what it is, when, and what it is about — and nothing to
 * press (owner, 2026-09-16: "keep simple and clear").
 *
 * Replying and postponing live on the Calendar, where somebody has gone to deal
 * with a meeting. Today is the glance: it says a meeting is coming and what it
 * concerns, then gets out of the way.
 */
export function MeetingCard({ meeting }: { meeting: CalendarEventDTO }) {
  // "Milestone 1 review" says nothing on its own — the project belongs in the
  // headline (owner, 2026-09-08).
  const headline = meeting.projectName ? `${meeting.title} · ${meeting.projectName}` : meeting.title;
  const when = [dateWord(meeting.date), meeting.startTime].filter(Boolean).join(" · ");

  return (
    <Card as="article" className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-row font-medium text-ink">{headline}</p>
          <p className="truncate text-micro text-muted">{when}</p>
          {/* A meeting scheduled from a task says which one, and opens it (owner, 2026-09-11). */}
          {meeting.taskNumber ? (
            <Link href={`/work/${meeting.taskNumber}`} className="block truncate text-micro font-medium text-primary-ink hover:underline">
              {meeting.taskRef} · {meeting.taskTitle}
            </Link>
          ) : null}
        </div>
        {meeting.milestoneId ? <Chip tone="primary">Review</Chip> : null}
      </div>
    </Card>
  );
}
