"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { NotificationDTO } from "@/lib/types";

type NotificationsPayload = {
  items: NotificationDTO[];
  unread: number;
  // Currently snoozed (future) items, for the "Snoozed (N)" section (phase 23).
  snoozed: NotificationDTO[];
};

/**
 * The bell's data. No realtime infra — it refetches on window focus and a light
 * 60s interval, which is enough for a meeting notification (they are not
 * second-sensitive). This is the universal fallback for anyone without push.
 */
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiGet<NotificationsPayload>("/api/notifications"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (input: { id: string } | { all: true }) =>
      apiPost<{ ok: true }>("/api/notifications/read", input),
    onSettled: invalidate,
  });

  // Snooze (phase 23). `until` is a future ISO instant; passing null unsnoozes.
  const snooze = useMutation({
    mutationFn: ({ id, until }: { id: string; until: string | null }) =>
      apiPatch<{ ok: true }>(`/api/notifications/${id}/snooze`, { until }),
    onSettled: invalidate,
  });

  return { markRead, snooze };
}
