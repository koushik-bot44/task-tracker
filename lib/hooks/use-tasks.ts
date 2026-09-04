"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import {
  allTasksKey,
  privateTasksKey,
  restoreTaskLists,
  tasksKey,
  writeTaskLists,
  type ListScope,
} from "@/lib/task-cache";
import { descendantIds } from "@/lib/tree";
import type { TaskStatus, TaskDTO } from "@/lib/types";

// Re-exported so existing importers keep one path.
export { tasksKey, allTasksKey, privateTasksKey };

export function useTasks(projectId: string | null) {
  return useQuery({
    queryKey: tasksKey(projectId ?? "none"),
    queryFn: () => apiGet<TaskDTO[]>(`/api/tasks?projectId=${projectId}`),
    enabled: Boolean(projectId),
  });
}

/** Every live task across every project the caller can see. */
export function useAllTasks() {
  return useQuery({
    queryKey: allTasksKey,
    queryFn: () => apiGet<TaskDTO[]>("/api/tasks?view=all"),
  });
}

/** The caller's own PRIVATE tasks (My notes). */
export function usePrivateTasks(enabled = true) {
  return useQuery({
    queryKey: privateTasksKey,
    queryFn: () => apiGet<TaskDTO[]>("/api/tasks?scope=private"),
    enabled,
  });
}

export const taskKey = (id: string) => ["task", id] as const;

/**
 * One task by id. The flat project list stays authoritative when it is loaded —
 * this only has to cover the pages that never load it, like Today.
 */
export function useTask(id: string | null) {
  const qc = useQueryClient();
  const single = useQuery({
    queryKey: taskKey(id ?? "none"),
    queryFn: () => apiGet<TaskDTO>(`/api/tasks/${id}`),
    enabled: Boolean(id),
  });

  const fromList = id
    ? qc
        .getQueriesData<TaskDTO[]>({ queryKey: ["tasks"] })
        .flatMap(([, rows]) => rows ?? [])
        .find((t) => t.id === id)
    : undefined;

  return { ...single, data: fromList ?? single.data };
}

export type TaskPatch = {
  title?: string;
  descriptionMd?: string;
  status?: TaskStatus;
  dueDate?: string | null;
  parentId?: string | null;
  milestoneId?: string | null;
  orderKey?: string;
  deliverableUrl?: string | null;
  assigneeId?: string | null;
  important?: boolean;
  archived?: boolean;
};

/** Client-side id so an optimistic row keeps its identity through the round trip. */
export function newTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What a mutation hook is writing into: a project's tasks, or the private space. */
export type MutationScope =
  | { kind: "project"; projectId: string }
  | { kind: "private"; personalProjectId: string; ownerId: string };

export function useTaskMutations(scope: MutationScope) {
  const qc = useQueryClient();
  const isPrivate = scope.kind === "private";
  const listScope: ListScope = isPrivate ? { private: true } : { projectId: scope.projectId };
  const primaryKey = isPrivate ? privateTasksKey : tasksKey(scope.projectId);

  const writeLists = (fn: (rows: TaskDTO[]) => TaskDTO[]) => writeTaskLists(qc, listScope, fn);

  // Any task write can move a Today or Projects number.
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["task"] });
    void qc.invalidateQueries({ queryKey: ["today"] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
    void qc.invalidateQueries({ queryKey: ["milestones"] });
  };

  const createTask = useMutation({
    mutationFn: (input: {
      id: string;
      parentId: string | null;
      orderKey: string;
      title?: string;
      descriptionMd?: string;
      status?: TaskStatus;
      dueDate?: string | null;
      dueProvisional?: boolean;
      assigneeId?: string | null;
      milestoneId?: string | null;
      important?: boolean;
    }) =>
      apiPost<TaskDTO>("/api/tasks", {
        ...input,
        ...(isPrivate
          ? { isPrivate: true, personalProjectId: scope.personalProjectId }
          : { projectId: scope.projectId }),
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const now = new Date().toISOString();
      const optimistic: TaskDTO = {
        id: input.id,
        projectId: isPrivate ? null : scope.projectId,
        isPrivate,
        ownerId: isPrivate ? scope.ownerId : null,
        personalProjectId: isPrivate ? scope.personalProjectId : null,
        parentId: input.parentId,
        milestoneId: input.milestoneId ?? null,
        title: input.title ?? "",
        descriptionMd: input.descriptionMd ?? "",
        status: input.status ?? "TODO",
        dueDate: input.dueDate ?? null,
        dueProvisional: input.dueProvisional ?? false,
        orderKey: input.orderKey,
        important: input.important ?? false,
        archived: false,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        deletedAt: null,
        deliverableUrl: null,
        completedById: null,
        completedByName: null,
        assigneeId: input.assigneeId ?? null,
        assigneeName: null,
        givenById: null,
        givenByName: null,
        hasDescription: (input.descriptionMd ?? "").trim().length > 0,
        noteCount: 0,
        stepCount: 0,
        stepsDone: 0,
      };
      const prior = writeLists((rows) => [...rows, optimistic]);
      return { prior };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prior) restoreTaskLists(qc, ctx.prior);
    },
    onSuccess: (created) => {
      writeLists((rows) => rows.map((t) => (t.id === created.id ? created : t)));
    },
    onSettled: invalidate,
  });

  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch; quiet?: boolean }) =>
      apiPatch<TaskDTO>(`/api/tasks/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const now = new Date().toISOString();
      const prior = writeLists((rows) =>
        rows.map((t) => {
          if (t.id !== id) return t;
          const next: TaskDTO = { ...t, ...patch, updatedAt: now };
          if (patch.status !== undefined) {
            if (patch.status === "DONE" && t.status !== "DONE") next.completedAt = now;
            else if (patch.status !== "DONE" && t.status === "DONE") next.completedAt = null;
          }
          return next;
        }),
      );
      return { prior };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prior) restoreTaskLists(qc, ctx.prior);
    },
    onSuccess: (updated) => {
      writeLists((rows) => rows.map((t) => (t.id === updated.id ? updated : t)));
    },
    onSettled: (_data, _err, variables) => {
      if (!variables?.quiet) invalidate();
    },
  });

  const deleteTask = useMutation({
    mutationFn: ({ id }: { id: string; removed: TaskDTO[] }) => apiDelete<{ ok: true }>(`/api/tasks/${id}`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const projRows = qc.getQueryData<TaskDTO[]>(primaryKey) ?? [];
      const doomed = new Set([id, ...descendantIds(projRows, id)]);
      const prior = writeLists((rows) => rows.filter((t) => !doomed.has(t.id)));
      return { prior };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prior) restoreTaskLists(qc, ctx.prior);
    },
    onSettled: invalidate,
  });

  const restoreTask = useMutation({
    mutationFn: ({ id }: { id: string; rows: TaskDTO[] }) => apiPatch<TaskDTO>(`/api/tasks/${id}`, { deletedAt: null }),
    onMutate: async ({ rows }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prior = writeLists((existing) => {
        const present = new Set(existing.map((t) => t.id));
        return [...existing, ...rows.filter((r) => !present.has(r.id))];
      });
      return { prior };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prior) restoreTaskLists(qc, ctx.prior);
    },
    onSettled: invalidate,
  });

  return { createTask, updateTask, deleteTask, restoreTask };
}
