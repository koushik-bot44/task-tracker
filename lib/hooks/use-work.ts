"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type {
  ActivityDTO,
  AssignmentGroupDTO,
  AssignmentRuleDTO,
  CalendarEventDTO,
  DashboardTodayDTO,
  ResolutionCode,
  TaskCategoryDTO,
  TaskDTO,
  WaitingReason,
  WorkListDTO,
  WorkState,
} from "@/lib/types";

export const workKey = ["work"] as const;
export const activityKey = (taskId: string) => ["activity", taskId] as const;
export const groupsKey = ["groups"] as const;
export const categoriesKey = ["categories"] as const;
export const dashboardKey = ["dashboard"] as const;

export type WorkQuery = Record<string, string | number | boolean | undefined>;

function qs(q: WorkQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === "" || v === false) continue;
    p.set(k, v === true ? "1" : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** The queue. */
export function useWorkList(query: WorkQuery, enabled = true) {
  return useQuery({
    queryKey: [...workKey, "list", query],
    queryFn: () => apiGet<WorkListDTO>(`/api/work${qs(query)}`),
    enabled,
    staleTime: 15_000,
  });
}

/** One task by its number, with what the caller may do to it. */
export function useWorkItem(number: string | number | null) {
  return useQuery({
    queryKey: [...workKey, "item", String(number)],
    queryFn: () => apiGet<TaskDTO>(`/api/work/${number}`),
    enabled: number !== null && number !== "",
  });
}

/** A task's meetings, for the small calendar on its record (owner, 2026-09-11). */
export function useTaskMeetings(taskId: string | null) {
  return useQuery({
    queryKey: ["task-meetings", taskId ?? ""],
    queryFn: () => apiGet<CalendarEventDTO[]>(`/api/tasks/${taskId}/meetings`),
    enabled: Boolean(taskId),
    staleTime: 15_000,
  });
}

export type ActivityFilter = { type?: string; order?: "asc" | "desc"; mentions?: "me" };

export function useActivity(taskId: string | null, filter: ActivityFilter = {}) {
  return useQuery({
    queryKey: [...activityKey(taskId ?? ""), filter],
    queryFn: () => apiGet<ActivityDTO[]>(`/api/tasks/${taskId}/activity${qs(filter)}`),
    enabled: Boolean(taskId),
    refetchInterval: 30_000,
  });
}

export type NoteInput = {
  body: string;
  internal?: boolean;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  /** Every file on the note (2026-09-10). */
  attachments?: { url: string; name: string; type: string; size?: number | null }[];
  mentions?: string[];
};
export type TransitionInput = { to: WorkState; waitingReason?: WaitingReason | null; waitingNote?: string | null; resolutionCode?: ResolutionCode | null; resolutionNotes?: string | null; rootCause?: string | null; note?: string | null };

/** Every write to a task from the work screens. Each refreshes every screen that shows tasks. */
export function useWorkMutations(taskId: string | null) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: workKey });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["task"] });
    void qc.invalidateQueries({ queryKey: ["today"] });
    void qc.invalidateQueries({ queryKey: dashboardKey });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    if (taskId) void qc.invalidateQueries({ queryKey: activityKey(taskId) });
  };
  const transition = useMutation({
    mutationFn: (input: TransitionInput) => apiPost<TaskDTO>(`/api/tasks/${taskId}/transition`, input),
    onSettled: refresh,
  });
  const assign = useMutation({
    mutationFn: (input: { assignmentGroupId?: string | null; assigneeId?: string | null }) => apiPost<TaskDTO>(`/api/tasks/${taskId}/assign`, input),
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiPatch<TaskDTO>(`/api/tasks/${taskId}`, patch),
    onSettled: refresh,
  });
  const addNote = useMutation({
    mutationFn: ({ internal, ...input }: NoteInput) => apiPost<ActivityDTO>(`/api/tasks/${taskId}/${internal ? "work-notes" : "comments"}`, input),
    onSettled: refresh,
  });
  const removeNote = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/comments/${id}`),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => apiDelete<{ ok: true }>(`/api/tasks/${taskId}`),
    onSettled: refresh,
  });
  return { transition, assign, update, addNote, removeNote, remove, refresh };
}

/** Raise a task from the Work screen (no project needed). */
export function useRaiseWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => apiPost<TaskDTO>("/api/tasks", input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: workKey });
      void qc.invalidateQueries({ queryKey: dashboardKey });
      void qc.invalidateQueries({ queryKey: ["today"] });
    },
  });
}

export function useDashboardToday(enabled = true) {
  return useQuery({ queryKey: [...dashboardKey, "today"], queryFn: () => apiGet<DashboardTodayDTO>("/api/dashboard/today"), enabled, staleTime: 15_000 });
}

export function useGroups(enabled = true) {
  return useQuery({ queryKey: groupsKey, queryFn: () => apiGet<AssignmentGroupDTO[]>("/api/assignment-groups"), enabled, staleTime: 60_000 });
}

export function useCategories(enabled = true) {
  return useQuery({ queryKey: categoriesKey, queryFn: () => apiGet<TaskCategoryDTO[]>("/api/task-categories"), enabled, staleTime: 60_000 });
}

export function useGroupMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: groupsKey });
    void qc.invalidateQueries({ queryKey: dashboardKey });
  };
  const createGroup = useMutation({
    mutationFn: (input: { departmentId: string; name: string; description?: string; leadId?: string | null; memberIds?: string[] }) => apiPost<AssignmentGroupDTO>("/api/assignment-groups", input),
    onSettled: refresh,
  });
  const updateGroup = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; description?: string; leadId?: string | null; active?: boolean } }) => apiPatch<AssignmentGroupDTO>(`/api/assignment-groups/${id}`, patch),
    onSettled: refresh,
  });
  const addMembers = useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) => apiPost<AssignmentGroupDTO>(`/api/assignment-groups/${id}/members`, { userIds }),
    onSettled: refresh,
  });
  const removeMembers = useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) => apiDelete<AssignmentGroupDTO>(`/api/assignment-groups/${id}/members`, { userIds }),
    onSettled: refresh,
  });
  const deleteGroup = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/assignment-groups/${id}`),
    onSettled: refresh,
  });
  return { createGroup, updateGroup, addMembers, removeMembers, deleteGroup };
}

export const rulesKey = ["assignment-rules"] as const;

export function useRules(enabled = true) {
  return useQuery({ queryKey: rulesKey, queryFn: () => apiGet<AssignmentRuleDTO[]>("/api/assignment-rules"), enabled, staleTime: 30_000 });
}

export function useRuleMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: rulesKey });
  const createRule = useMutation({
    mutationFn: (input: Omit<AssignmentRuleDTO, "id">) => apiPost<AssignmentRuleDTO>("/api/assignment-rules", input),
    onSettled: refresh,
  });
  const updateRule = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<AssignmentRuleDTO, "id">> }) => apiPatch<AssignmentRuleDTO>(`/api/assignment-rules/${id}`, patch),
    onSettled: refresh,
  });
  const deleteRule = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/assignment-rules/${id}`),
    onSettled: refresh,
  });
  return { createRule, updateRule, deleteRule };
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: categoriesKey });
  const createCategory = useMutation({
    mutationFn: (input: { name: string; departmentId?: string | null; assignmentGroupId?: string | null; parentId?: string | null }) => apiPost<TaskCategoryDTO>("/api/task-categories", input),
    onSettled: refresh,
  });
  const updateCategory = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; departmentId?: string | null; assignmentGroupId?: string | null; active?: boolean } }) => apiPatch<TaskCategoryDTO>(`/api/task-categories/${id}`, patch),
    onSettled: refresh,
  });
  const deleteCategory = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/task-categories/${id}`),
    onSettled: refresh,
  });
  return { createCategory, updateCategory, deleteCategory };
}

