"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { CalendarEventDTO, CalendarPayload } from "@/lib/types";

/** One window of the calendar. `projectIds` null = all tools (no filter). */
export function useCalendar(fromISO: string, toISO: string, projectIds: string[] | null) {
  const key = projectIds ? [...projectIds].sort().join(",") : "all";
  const projectsParam = projectIds ? `&projects=${encodeURIComponent(projectIds.join(","))}` : "";
  return useQuery({
    queryKey: ["calendar", fromISO, toISO, key],
    queryFn: () =>
      apiGet<CalendarPayload>(`/api/calendar?from=${fromISO}&to=${toISO}${projectsParam}`),
  });
}

type EventInput = {
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  projectId: string | null;
  // Meetings (phase 22). isMeeting flips the create into a meeting; the rest are
  // required/allowed only then.
  isMeeting?: boolean;
  startTime?: string; // HH:MM
  endTime?: string | null;
  attendeeIds?: string[];
};

export function useEventMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    // A meeting create/edit/cancel also changes the Meetings tab history.
    void qc.invalidateQueries({ queryKey: ["meetings"] });
    // Creating/moving/cancelling an event can produce notifications for others,
    // and the actor may be a recipient of nothing — but refresh the bell anyway.
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const createEvent = useMutation({
    mutationFn: (input: EventInput) => apiPost<CalendarEventDTO>("/api/events", input),
    onSettled: invalidate,
  });

  const updateEvent = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<EventInput> }) =>
      apiPatch<CalendarEventDTO>(`/api/events/${id}`, patch),
    onSettled: invalidate,
  });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/events/${id}`),
    onSettled: invalidate,
  });

  return { createEvent, updateEvent, deleteEvent };
}
