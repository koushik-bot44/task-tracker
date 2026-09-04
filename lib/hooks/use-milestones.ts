"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { MilestoneDTO } from "@/lib/types";

export const milestonesKey = (projectId: string) => ["milestones", projectId] as const;

export function useMilestones(projectId: string | null) {
  return useQuery({
    queryKey: milestonesKey(projectId ?? "none"),
    queryFn: () => apiGet<MilestoneDTO[]>(`/api/milestones?projectId=${projectId}`),
    enabled: Boolean(projectId),
  });
}

export function useMilestoneMutations(projectId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: milestonesKey(projectId) });
    void qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    void qc.invalidateQueries({ queryKey: ["today"] });
  };
  const addMilestone = useMutation({
    mutationFn: (input: { name: string; reviewDate: string }) => apiPost<MilestoneDTO>("/api/milestones", { projectId, ...input }),
    onSettled: refresh,
  });
  const updateMilestone = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; reviewDate?: string } }) => apiPatch<MilestoneDTO>(`/api/milestones/${id}`, patch),
    onSettled: refresh,
  });
  const deleteMilestone = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/milestones/${id}`),
    onSettled: refresh,
  });
  return { addMilestone, updateMilestone, deleteMilestone };
}
