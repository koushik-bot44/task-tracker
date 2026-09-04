"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { projectsKey } from "@/lib/hooks/use-projects";
import type { DepartmentDTO } from "@/lib/types";

export const departmentsKey = ["departments"] as const;

export function useDepartments() {
  return useQuery({
    queryKey: departmentsKey,
    queryFn: () => apiGet<DepartmentDTO[]>("/api/departments"),
  });
}

export function useDepartmentMutations() {
  const qc = useQueryClient();

  const createDepartment = useMutation({
    mutationFn: (input: { name: string; color: string; icon?: string | null; orderKey?: string }) =>
      apiPost<DepartmentDTO>("/api/departments", input),
    onSettled: () => void qc.invalidateQueries({ queryKey: departmentsKey }),
  });

  const updateDepartment = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<DepartmentDTO, "name" | "color" | "icon" | "orderKey">>;
    }) => apiPatch<DepartmentDTO>(`/api/departments/${id}`, patch),
    // Rename / recolour / reorder should feel instant; roll back on failure.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: departmentsKey });
      const previous = qc.getQueryData<DepartmentDTO[]>(departmentsKey) ?? [];
      qc.setQueryData<DepartmentDTO[]>(
        departmentsKey,
        previous
          .map((f) => (f.id === id ? { ...f, ...patch } : f))
          .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(departmentsKey, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: departmentsKey }),
  });

  const deleteDepartment = useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ ok: true; unfiledProjects: number }>(`/api/departments/${id}`),
    onSettled: () => {
      // Department gone AND its tools are now unfiled — both lists must refresh.
      void qc.invalidateQueries({ queryKey: departmentsKey });
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
  });

  return { createDepartment, updateDepartment, deleteDepartment };
}
