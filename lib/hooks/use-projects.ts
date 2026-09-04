"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { DEFAULT_GATE_TEMPLATE } from "@/lib/gates";
import type { Health, ProjectDTO, ProjectTeamDTO } from "@/lib/types";

export const projectsKey = ["projects"] as const;

export function useProjects() {
  return useQuery({
    queryKey: projectsKey,
    queryFn: () => apiGet<ProjectDTO[]>("/api/projects"),
  });
}

/**
 * A project's people (lead + developer members) for the sidebar members popover
 * (phase 17). Fetched lazily — only once a popover opens (enabled) — and cached
 * a minute so re-opening the same one is instant.
 */
export function useProjectTeam(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["project-team", id],
    queryFn: () => apiGet<ProjectTeamDTO>(`/api/projects/${id}/team`),
    enabled: enabled && Boolean(id),
    staleTime: 60_000,
  });
}

/** Resolve a URL slug to a tool from the already-cached project list. */
export function useProjectBySlug(slug: string) {
  const query = useProjects();
  const project = (query.data ?? []).find((p) => p.slug === slug) ?? null;
  return { ...query, project };
}

/** The tool a task belongs to — the detail panel needs it to read that tool's
    edit rail, and it opens from Focus and the Changelog where no slug is in
    the URL. */
export function useProjectById(id: string | null) {
  const query = useProjects();
  const project = (query.data ?? []).find((p) => p.id === id) ?? null;
  return { ...query, project };
}

export function useProjectMutations() {
  const qc = useQueryClient();

  const createProject = useMutation({
    mutationFn: (input: {
      name: string;
      color?: string;
      description: string;
      /** Optional (phase 31): a project can start without a lead. */
      leadId?: string;
      /** Initial developer members (phase 11). Server keeps only real,
          active developers; anyone else in the list is dropped silently. */
      developerIds?: string[];
      /** Phase 29/31: invite brand-new people straight into the project, each with
          a role (RESOURCE joins as a member; TEAM_LEAD is created for you to assign). */
      inviteNew?: { name: string; email: string; role?: "RESOURCE" | "TEAM_LEAD" }[];
      /** Department to file the new tool under (phase 12); null/omitted = unfiled. */
      departmentId?: string | null;
      /** Phase 48: how urgent, and by when ("YYYY-MM-DD" or ISO). */
      priority?: ProjectDTO["priority"];
      deadline?: string;
    }) => apiPost<ProjectDTO>("/api/projects", input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: projectsKey });
      const previous = qc.getQueryData<ProjectDTO[]>(projectsKey) ?? [];
      const optimistic: ProjectDTO = {
        id: `optimistic-${Date.now()}`,
        name: input.name,
        slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        color: input.color ?? "#2dd4bf",
        icon: null,
        health: "ACTIVE",
        gateTemplate: DEFAULT_GATE_TEMPLATE,
        orderKey: "zzzz",
        createdAt: new Date().toISOString(),
        taskCount: 0,
        description: input.description,
        leadId: input.leadId ?? null,
        leadName: null,
        departmentId: input.departmentId ?? null,
        // The server stamps the real owner (the creating manager); the refetch
        // replaces this optimistic row with it.
        ownerId: null,
        priority: "MEDIUM",
        deadline: null,
      };
      qc.setQueryData<ProjectDTO[]>(projectsKey, [...previous, optimistic]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectsKey, ctx.previous);
    },
    onSuccess: (created, _input, ctx) => {
      qc.setQueryData<ProjectDTO[]>(projectsKey, (current = []) =>
        current.map((p) => (p.id === ctx?.optimisticId ? created : p)),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
  });

  const updateProject = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<ProjectDTO, "name" | "color" | "icon" | "health" | "description" | "leadId" | "departmentId">
      >;
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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/projects/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: projectsKey });
      const previous = qc.getQueryData<ProjectDTO[]>(projectsKey) ?? [];
      qc.setQueryData<ProjectDTO[]>(
        projectsKey,
        previous.filter((p) => p.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(projectsKey, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
  });

  return { createProject, updateProject, deleteProject };
}

/** Health as plain coloured text, for the sidebar's quiet second line.
    -ink values only: this is text on the sidebar surface, so it owes 4.5:1. */
export const HEALTH_TEXT: Record<Health, string> = {
  ACTIVE: "text-primary-ink",
  PAUSED: "text-muted",
  SHIPPED: "text-warn-ink",
  IDEA: "text-muted",
};
