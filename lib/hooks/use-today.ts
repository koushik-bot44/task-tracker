"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { CalendarEventDTO, MeetingResponse, MilestoneDTO, MilestoneOutcome, TodayDTO } from "@/lib/types";

export const todayKey = ["today"] as const;

export function useToday() {
  return useQuery({
    queryKey: todayKey,
    queryFn: () => apiGet<TodayDTO>("/api/today"),
    refetchOnWindowFocus: true,
  });
}

/** [I'll be there] / [Can't], plus Reschedule, from Today or the Calendar. */
export function useMeetingReply() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: todayKey });
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const reply = useMutation({
    mutationFn: ({ eventId, response }: { eventId: string; response: MeetingResponse }) =>
      apiPost<CalendarEventDTO>(`/api/events/${eventId}/reply`, { response }),
    onSettled: refresh,
  });
  const slots = (eventId: string) => apiGet<{ slots: string[] }>(`/api/events/${eventId}/reschedule`);
  const reschedule = useMutation({
    mutationFn: ({ eventId, date }: { eventId: string; date: string }) =>
      apiPost<{ event: CalendarEventDTO; resent: number }>(`/api/events/${eventId}/reschedule`, { date }),
    onSettled: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["milestones"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  return { reply, slots, reschedule };
}

/** "Needs your OK": On track / Needs work (+ line, + %). */
export function useReviewOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, outcome, note, progress }: { milestoneId: string; outcome: MilestoneOutcome; note?: string; progress?: number }) =>
      apiPost<MilestoneDTO>(`/api/milestones/${milestoneId}/outcome`, { outcome, note, progress }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: todayKey });
      void qc.invalidateQueries({ queryKey: ["milestones"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}
