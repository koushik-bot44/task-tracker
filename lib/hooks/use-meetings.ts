"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

/** A candidate attendee for a project's meeting. */
export type MeetingCandidateDTO = { userId: string; name: string; role: "LEAD" | "RESOURCE" };

/** Everyone on a project, for the schedule sheet's face row. */
export function useMeetingCandidates(projectId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["meeting-candidates", projectId],
    queryFn: () => apiGet<MeetingCandidateDTO[]>(`/api/projects/${projectId}/attendees`),
    enabled: enabled && Boolean(projectId),
    staleTime: 60_000,
  });
}
