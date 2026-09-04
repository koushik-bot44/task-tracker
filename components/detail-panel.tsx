"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/cn";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjects } from "@/lib/hooks/use-projects";
import { usePrivateTasks, useTask, useTaskMutations, useTasks } from "@/lib/hooks/use-tasks";
import { isBlankStub } from "@/lib/tree";
import { DetailPanelBody } from "@/components/detail-panel-body";
import { Tooltip } from "@/components/tooltip";
import type { TaskDTO } from "@/lib/types";

/**
 * Right-hand peek on desktop, bottom sheet on mobile. Either way it is an
 * overlay — the tree underneath stays put, and Back closes it because the
 * open state is a query parameter rather than component state.
 */
export function DetailPanelHost() {
  const { taskId, closeTask } = usePanelParams();
  const reduce = useReducedMotion();
  const { data: task, isLoading } = useTask(taskId);
  const qc = useQueryClient();

  // The board "+" and "Add subtask" mint a task, then open it here to be named — so
  // leaving without a name (close, scrim, or Escape) must discard the abandoned blank
  // stub, the same guarantee the tree gives its rows on blur. Read the row and every row
  // it could parent straight from the cache keyed by the URL's taskId: the reactive hook
  // data (task/useTasks) can be momentarily undefined mid-navigation — right after
  // "Add subtask" opens the new row — while the cache stays populated. The delete is by
  // id, so it lands regardless of the mutation's list scope.
  const { deleteTask } = useTaskMutations(
    task && task.isPrivate
      ? { kind: "private", personalProjectId: task.personalProjectId ?? "", ownerId: task.ownerId ?? "" }
      : { kind: "project", projectId: task && !task.isPrivate ? task.projectId ?? "" : "", gateTemplate: [] },
  );
  const closeAndDiscardBlank = useCallback(() => {
    if (taskId) {
      const rows = qc
        .getQueriesData<TaskDTO[]>({ queryKey: ["tasks"] })
        .flatMap(([, r]) => r ?? []);
      const open = rows.find((r) => r.id === taskId);
      if (open && isBlankStub(open, rows)) {
        deleteTask.mutate({ id: open.id, removed: [open] });
      }
    }
    closeTask();
  }, [taskId, qc, deleteTask, closeTask]);

  useEffect(() => {
    if (!taskId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndDiscardBlank();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [taskId, closeAndDiscardBlank]);

  return (
    <AnimatePresence>
      {taskId ? (
        <>
          <motion.div
            key="panel-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
            onClick={closeAndDiscardBlank}
            className="fixed inset-0 z-drawer bg-black/40"
            aria-hidden
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-label="Task detail"
            aria-modal="true"
            /* One element, two shapes, decided by CSS. This used to branch on
               a JS media query whose state could disagree with the rendered
               width — at 390px the sheet came out as an off-screen right
               drawer with its close button past the edge. */
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-drawer flex max-h-[88dvh] flex-col rounded-t-sheet border-t border-line bg-surface shadow-lift md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[26rem] md:max-w-[92vw] md:rounded-t-none md:border-l md:border-t-0"
          >
            <div className="flex justify-center pt-2 md:hidden" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-line" />
            </div>

            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
              {task ? (
                <TaskBreadcrumb task={task} />
              ) : (
                <p className="text-micro font-medium uppercase tracking-widest text-muted">
                  Task
                </p>
              )}
              <Tooltip content="Close — Escape also works">
                <button
                  type="button"
                  onClick={closeAndDiscardBlank}
                  aria-label="Close details"
                  className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:text-ink"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </button>
              </Tooltip>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
              {task ? (
                <DetailPanelBody task={task} />
              ) : isLoading ? (
                <div className="space-y-3 p-4" aria-hidden>
                  <div className="h-6 w-2/3 animate-pulse rounded bg-hover" />
                  <div className="h-4 w-1/3 animate-pulse rounded bg-hover" />
                  <div className="h-24 animate-pulse rounded bg-hover" />
                </div>
              ) : (
                <p className="p-4 text-sm text-muted">
                  That task no longer exists.
                </p>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * The trail down to the task on screen: Project › Task › Subtask › … (or
 * My Space › … for a private task). The project crumb links to its tree; every
 * ancestor task crumb re-points the ?task query param, so clicking one swaps the
 * panel to it without closing — you can climb back up the whole path. The
 * current task is the last crumb and is not a link. Task titles come from the
 * list the body already loads (one query, deduped) with the current title taken
 * from the freshest single-task query; the project name/slug from useProjects.
 */
function TaskBreadcrumb({ task }: { task: TaskDTO }) {
  const { openTask } = usePanelParams();
  const router = useRouter();
  const projectTasks = useTasks(task.isPrivate ? null : task.projectId);
  const privateTasks = usePrivateTasks(task.isPrivate);
  const all = task.isPrivate ? privateTasks.data : projectTasks.data;
  const { data: projects } = useProjects();

  const crumbs = useMemo(() => {
    // Ancestor chain of tasks, root task first, current task last.
    const byId = new Map((all ?? []).map((t) => [t.id, t]));
    const taskChain: { id: string; title: string }[] = [];
    const seen = new Set<string>();
    let node = byId.get(task.id);
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      taskChain.unshift({ id: node.id, title: node.title });
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
    if (taskChain.length === 0) taskChain.push({ id: task.id, title: task.title });
    else taskChain[taskChain.length - 1] = { id: task.id, title: task.title };

    const out: { key: string; label: string; onClick?: () => void }[] = [];
    // Root crumb: the project (or My Space for a private task), linked to it.
    if (task.isPrivate) {
      out.push({ key: "space", label: "My Space", onClick: () => router.push("/my-space") });
    } else {
      const project = (projects ?? []).find((p) => p.id === task.projectId);
      if (project) {
        out.push({ key: "project", label: project.name, onClick: () => router.push(`/t/${project.slug}`) });
      }
    }
    // Then the task chain; the current task (last) is not a link.
    taskChain.forEach((c, i) => {
      const current = i === taskChain.length - 1;
      out.push({
        key: c.id,
        label: c.title.trim() || "Untitled",
        onClick: current ? undefined : () => openTask(c.id),
      });
    });
    return out;
  }, [all, task, projects, router, openTask]);

  if (crumbs.length === 0) {
    return (
      <p className="text-micro font-medium uppercase tracking-widest text-muted">Task</p>
    );
  }

  return (
    <nav
      aria-label="Task breadcrumb"
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-xs"
    >
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={crumb.key}>
            {i > 0 ? (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-muted"
                strokeWidth={2}
                aria-hidden
              />
            ) : null}
            {crumb.onClick ? (
              <button
                type="button"
                onClick={crumb.onClick}
                title={`Go to ${crumb.label}`}
                className="press max-w-[9rem] shrink-0 truncate rounded px-1 py-0.5 text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
              >
                {crumb.label}
              </button>
            ) : (
              <span
                className={cn("min-w-0 truncate", last ? "font-semibold text-ink" : "text-muted")}
                title={crumb.label}
                aria-current={last ? "page" : undefined}
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
