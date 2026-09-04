"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { freshGatesFromTemplate, type Gate } from "@/lib/gates";
import {
  allTasksKey,
  privateTasksKey,
  restoreTaskLists,
  tasksKey,
  writeTaskLists,
  type ListScope,
} from "@/lib/task-cache";
import { descendantIds } from "@/lib/tree";
import type { LinkItem, Priority, Status, TaskDTO } from "@/lib/types";

// Re-exported so existing importers (Focus reads allTasksKey) keep one path.
export { tasksKey, allTasksKey, privateTasksKey };

export function useTasks(projectId: string | null) {
  return useQuery({
    queryKey: tasksKey(projectId ?? "none"),
    queryFn: () => apiGet<TaskDTO[]>(`/api/tasks?projectId=${projectId}`),
    enabled: Boolean(projectId),
  });
}

/** Every non-deleted task across every tool — Focus and the Changelog. */
export function useAllTasks() {
  return useQuery({
    queryKey: allTasksKey,
    queryFn: () => apiGet<TaskDTO[]>("/api/tasks?view=all"),
  });
}

/** The caller's own PRIVATE personal tasks (phase 15) — the My Space source. */
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
 * this only has to cover the pages that never load it, like Focus.
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
  status?: Status;
  priority?: Priority;
  dueDate?: string | null;
  gates?: Gate[];
  tags?: string[];
  links?: LinkItem[];
  parentId?: string | null;
  orderKey?: string;
  pinnedAt?: string | null;
  deliverableUrl?: string | null;
  assigneeId?: string | null;
  color?: string | null;
  groupColor?: string | null;
};

/**
 * Client-side id so an optimistic row keeps its identity through the round trip.
 * The server validates this as a UUID, so the fallback must produce one too —
 * `randomUUID` is absent on insecure origins.
 */
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
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What a mutation hook is writing into: a project's tasks, or the private space. */
export type MutationScope =
  | { kind: "project"; projectId: string; gateTemplate: Gate[] }
  | { kind: "private"; personalProjectId: string; ownerId: string };

export function useTaskMutations(scope: MutationScope) {
  const qc = useQueryClient();
  const isPrivate = scope.kind === "private";
  const listScope: ListScope = isPrivate
    ? { private: true }
    : { projectId: scope.projectId };
  // The list a subtree walk reads from (holds every descendant): the project's
  // own list, or the single private list.
  const primaryKey = isPrivate ? privateTasksKey : tasksKey(scope.projectId);

  /**
   * Every mutation writes through BOTH lists a task lives in — its project list
   * and ["tasks","all"] — via lib/task-cache. See that file for why: a
   * project-scoped write alone left Focus/Changelog/Home stale until a reload.
   * A private task lives only in the private list, so this writes just that one.
   */
  const writeLists = (fn: (rows: TaskDTO[]) => TaskDTO[]) =>
    writeTaskLists(qc, listScope, fn);

  // Any task write can move a Command Center number, so the overview goes stale
  // alongside the task lists. Prefix ["tasks"] so BOTH the project list and
  // ["tasks","all"] refetch — invalidation is a prefix match.
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
    void qc.invalidateQueries({ queryKey: ["task"] });
  };

  const createTask = useMutation({
    mutationFn: (input: {
      id: string;
      parentId: string | null;
      orderKey: string;
      title?: string;
      descriptionMd?: string;
      status?: Status;
      dueDate?: string | null;
      dueProvisional?: boolean;
      assigneeId?: string | null;
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
        // Every private task (root + subtask) lives in the scope's personal project.
        personalProjectId: isPrivate ? scope.personalProjectId : null,
        groupColor: null,
        parentId: input.parentId,
        title: input.title ?? "",
        descriptionMd: input.descriptionMd ?? "",
        status: input.status ?? "BACKLOG",
        priority: "P2",
        dueDate: input.dueDate ?? null,
        dueProvisional: input.dueProvisional ?? false,
        orderKey: input.orderKey,
        gates: isPrivate ? [] : freshGatesFromTemplate(scope.gateTemplate),
        tags: [],
        links: [],
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        deletedAt: null,
        pinnedAt: null,
        deliverableUrl: null,
        completedById: null,
        completedByName: null,
        assigneeId: input.assigneeId ?? null,
        assigneeName: null,
        color: null,
        hasDescription: (input.descriptionMd ?? "").trim().length > 0,
        noteCount: 0,
      };
      const prior = writeLists((rows) => [...rows, optimistic]);
      return { prior };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prior) restoreTaskLists(qc, ctx.prior);
    },
    onSuccess: (created) => {
      // Server row wins, but the id already matched so nothing moves.
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
          // Mirror the server's completedAt rule so the optimistic row is honest.
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
      // Typing fires this constantly; the optimistic write plus the success
      // reconcile is already correct, so title edits skip the refetch.
      if (!variables?.quiet) invalidate();
    },
  });

  const deleteTask = useMutation({
    mutationFn: ({ id }: { id: string; removed: TaskDTO[] }) =>
      apiDelete<{ ok: true }>(`/api/tasks/${id}`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      // Descendants come from the primary list, which holds the whole subtree.
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
    mutationFn: ({ id }: { id: string; rows: TaskDTO[] }) =>
      apiPatch<TaskDTO>(`/api/tasks/${id}`, { deletedAt: null }),
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
