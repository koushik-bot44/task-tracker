"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { CalendarEventDTO } from "@/lib/types";

/** A candidate attendee for a project's meeting (phase 22). */
export type MeetingCandidateDTO = { userId: string; name: string; role: "LEAD" | "RESOURCE" };

/**
 * Every meeting the manager can schedule for — across all their own and
 * collaborated projects. The Meetings tab groups these by department/project and
 * splits each project into upcoming (date >= today) and past.
 */
export function useMeetings() {
  return useQuery({
    queryKey: ["meetings"],
    queryFn: () => apiGet<CalendarEventDTO[]>("/api/meetings"),
  });
}

/** The candidate attendees for a project's meeting — lead + developer members +
    assigned devs, with ids + role. Fetched when the schedule modal opens. */
export function useMeetingCandidates(projectId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["meeting-candidates", projectId],
    queryFn: () => apiGet<MeetingCandidateDTO[]>(`/api/projects/${projectId}/attendees`),
    enabled: enabled && Boolean(projectId),
    staleTime: 60_000,
  });
}
