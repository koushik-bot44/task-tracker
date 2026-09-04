"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { privateTasksKey } from "@/lib/hooks/use-tasks";
import type { TaskDTO } from "@/lib/types";

/** A user's PRIVATE department (phase 33) — name only, simple. */
export type PersonalDepartmentDTO = { id: string; name: string; orderKey: string; projectCount: number };
export type PersonalProjectDTO = { id: string; name: string; orderKey: string; departmentId: string };

export const personalDepartmentsKey = ["personal-departments"] as const;
export const personalProjectsKey = ["personal-projects"] as const;

const bySort = <T extends { orderKey: string }>(a: T, b: T) =>
  a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0;

export function usePersonalDepartments(enabled = true) {
  return useQuery({
    queryKey: personalDepartmentsKey,
    queryFn: () => apiGet<PersonalDepartmentDTO[]>("/api/my-space/departments"),
    enabled,
  });
}

export function usePersonalProjects(enabled = true) {
  return useQuery({
    queryKey: personalProjectsKey,
    queryFn: () => apiGet<PersonalProjectDTO[]>("/api/my-space/projects"),
    enabled,
  });
}

export function usePersonalDepartmentMutations() {
  const qc = useQueryClient();

  const createDepartment = useMutation({
    mutationFn: (input: { name: string; orderKey?: string }) =>
      apiPost<PersonalDepartmentDTO>("/api/my-space/departments", input),
    onSettled: () => void qc.invalidateQueries({ queryKey: personalDepartmentsKey }),
  });

  const updateDepartment = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; orderKey?: string } }) =>
      apiPatch<PersonalDepartmentDTO>(`/api/my-space/departments/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: personalDepartmentsKey });
      const previous = qc.getQueryData<PersonalDepartmentDTO[]>(personalDepartmentsKey) ?? [];
      qc.setQueryData<PersonalDepartmentDTO[]>(
        personalDepartmentsKey,
        previous.map((d) => (d.id === id ? { ...d, ...patch } : d)).sort(bySort),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(personalDepartmentsKey, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: personalDepartmentsKey }),
  });

  const deleteDepartment = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/my-space/departments/${id}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: personalDepartmentsKey }),
  });

  return { createDepartment, updateDepartment, deleteDepartment };
}

export function usePersonalProjectMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: personalProjectsKey });
    void qc.invalidateQueries({ queryKey: personalDepartmentsKey }); // projectCount
  };

  const createProject = useMutation({
    mutationFn: (input: { departmentId: string; name: string; orderKey?: string }) =>
      apiPost<PersonalProjectDTO>("/api/my-space/projects", input),
    onSettled: refresh,
  });

  const updateProject = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; orderKey?: string } }) =>
      apiPatch<PersonalProjectDTO>(`/api/my-space/projects/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: personalProjectsKey });
      const previous = qc.getQueryData<PersonalProjectDTO[]>(personalProjectsKey) ?? [];
      qc.setQueryData<PersonalProjectDTO[]>(
        personalProjectsKey,
        previous.map((p) => (p.id === id ? { ...p, ...patch } : p)).sort(bySort),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(personalProjectsKey, ctx.previous);
    },
    onSettled: refresh,
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/my-space/projects/${id}`),
    onSettled: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: privateTasksKey }); // its tasks went with it
    },
  });

  return { createProject, updateProject, deleteProject };
}

/** The DEVELOPER-only "Prompt" quick-capture — creates a private task from text. */
export function usePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { personalProjectId: string; text: string }) =>
      apiPost<TaskDTO>("/api/my-space/prompt", input),
    onSettled: () => void qc.invalidateQueries({ queryKey: privateTasksKey }),
  });
}
