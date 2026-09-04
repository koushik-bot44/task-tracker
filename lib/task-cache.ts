/**
 * Cross-list task-cache contract — one place that knows which cached lists a
 * task lives in, kept free of React and the API layer so it is unit-testable
 * (scripts/check-cross-list.ts) without a browser or a server.
 *
 * A task in project P appears in exactly two cached queries:
 *   ["tasks", P]      the project's own list — the tree and the board
 *   ["tasks", "all"]  the cross-project list — Focus, the Changelog, every Home
 *                     dashboard
 *
 * TanStack invalidation is a PREFIX match, so a project-scoped write or
 * invalidation never reaches ["tasks","all"]. A mutation that touched only the
 * project list left Focus stale until a hard reload — the exact bug this module
 * exists to make impossible: every mutation writes through writeTaskLists, so
 * both move together or neither does.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { TaskDTO } from "./types";

export const tasksKey = (projectId: string) => ["tasks", projectId] as const;
export const allTasksKey = ["tasks", "all"] as const;
/**
 * The caller's PRIVATE personal tasks (phase 15). A private task lives ONLY in
 * this list — never in ["tasks","all"] — which is the cache side of the same
 * isolation the server enforces: it must not leak into any cross-project view.
 * Still prefixed ["tasks"] so a broad invalidation still refetches it.
 */
export const privateTasksKey = ["tasks", "private"] as const;

/** Where a task's cached lists live: one project, or the private space. */
export type ListScope = { projectId: string } | { private: true };

/** The list(s) a task in this scope can appear in. */
export function taskListKeys(scope: ListScope): QueryKey[] {
  return "private" in scope
    ? [privateTasksKey]
    : [tasksKey(scope.projectId), allTasksKey];
}

/**
 * Apply `fn` to every cached list a task in `scope` lives in, and return the
 * prior snapshots so an onError can roll all of them back together. A list that
 * is not currently cached is skipped — there is nothing on screen reading it,
 * and it will refetch on invalidation.
 */
export function writeTaskLists(
  qc: QueryClient,
  scope: ListScope,
  fn: (rows: TaskDTO[]) => TaskDTO[],
): Array<[QueryKey, TaskDTO[] | undefined]> {
  const prior: Array<[QueryKey, TaskDTO[] | undefined]> = [];
  for (const key of taskListKeys(scope)) {
    const rows = qc.getQueryData<TaskDTO[]>(key);
    prior.push([key, rows]);
    if (rows) qc.setQueryData<TaskDTO[]>(key, fn(rows));
  }
  return prior;
}

/** Undo a writeTaskLists using the snapshot it returned. */
export function restoreTaskLists(
  qc: QueryClient,
  prior: Array<[QueryKey, TaskDTO[] | undefined]>,
): void {
  for (const [key, rows] of prior) qc.setQueryData(key, rows);
}
