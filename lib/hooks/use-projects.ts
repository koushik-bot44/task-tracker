"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { ProjectDTO, ProjectPersonDTO, ProjectStatus } from "@/lib/types";
import { isAdminRole } from "@/lib/roles";
import { useMe } from "@/lib/hooks/use-users";

export const projectsKey = ["projects"] as const;

/**
 * Every project the signed-in person may see. ADMIN looks after accounts and
 * PERSON is walled off — neither may read projects, so the request is never
 * made for them (it would only 403 in the console). While the account is
 * still loading, `isLoading` stays true so pages show a skeleton, not an
 * empty state.
 */
export function useProjects() {
  const me = useMe();
  const role = me.data?.role;
  const allowed = !!role && !isAdminRole(role) && role !== "PERSON";
  const query = useQuery({
    queryKey: projectsKey,
    queryFn: () => apiGet<ProjectDTO[]>("/api/projects"),
    enabled: allowed,
  });
  return { ...query, isLoading: query.isLoading || (me.isLoading && !query.data) };
}

/** Resolve a URL slug to a project from the already-cached list. */
export function useProjectBySlug(slug: string) {
  const query = useProjects();
  const project = (query.data ?? []).find((p) => p.slug === slug) ?? null;
  return { ...query, project };
}

export function useProjectById(id: string | null) {
  const query = useProjects();
  const project = (query.data ?? []).find((p) => p.id === id) ?? null;
  return { ...query, project };
}

/** Everyone on a project (faces), lead first. */
export function useProjectPeople(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["project-people", projectId],
    queryFn: () => apiGet<ProjectPersonDTO[]>(`/api/projects/${projectId}/members`),
    enabled: enabled && Boolean(projectId),
    staleTime: 30_000,
  });
}

export function useProjectMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: projectsKey });
    void qc.invalidateQueries({ queryKey: ["today"] });
    void qc.invalidateQueries({ queryKey: ["departments"] });
  };

  const createProject = useMutation({
    mutationFn: (input: {
      name: string;
      departmentId: string;
      leadId?: string | null;
      startDate?: string | null;
      deadline?: string | null;
      description?: string;
      color?: string;
    }) => apiPost<ProjectDTO>("/api/projects", input),
    onSettled: refresh,
  });

  const updateProject = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{
        name: string;
        color: string;
        status: ProjectStatus;
        description: string;
        leadId: string | null;
        departmentId: string | null;
        startDate: string | null;
        deadline: string | null;
        progress: number;
      }>;
    }) => apiPatch<ProjectDTO>(`/api/projects/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: projectsKey });
      const previous = qc.getQueryData<ProjectDTO[]>(projectsKey) ?? [];
      qc.setQueryData<ProjectDTO[]>(
        projectsKey,
        previous.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectsKey, ctx.previous);
    },
    onSettled: refresh,
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/projects/${id}`),
    onSettled: refresh,
  });

  const addPerson = useMutation({
    mutationFn: ({ projectId, userId, canManage }: { projectId: string; userId: string; canManage?: boolean }) =>
      apiPost<{ ok: true }>(`/api/projects/${projectId}/members`, { userId, canManage }),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ["project-people", v.projectId] });
      refresh();
    },
  });

  const invitePerson = useMutation({
    mutationFn: ({ projectId, name, email, role }: { projectId: string; name: string; email: string; role?: "RESOURCE" | "TEAM_LEAD" }) =>
      apiPost<{ ok: true; emailSent: boolean }>(`/api/projects/${projectId}/members`, { invite: { name, email, role } }),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ["project-people", v.projectId] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      refresh();
    },
  });

  const removePerson = useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      apiDelete<{ ok: true; stillAssignedTasks: number }>(`/api/projects/${projectId}/members`, { userId }),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ["project-people", v.projectId] });
      refresh();
    },
  });

  return { createProject, updateProject, deleteProject, addPerson, invitePerson, removePerson };
}
