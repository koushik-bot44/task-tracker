"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { TaskDrawer } from "@/components/task/task-drawer";
import { Drawer } from "@/components/ui/drawer";
import { Face } from "@/components/ui/face";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjects } from "@/lib/hooks/use-projects";
import { useTask, useTaskMutations } from "@/lib/hooks/use-tasks";
import { isBlankStub } from "@/lib/tree";
import type { TaskDTO } from "@/lib/types";

/**
 * The task drawer's host: reads ?task=<id> so Back closes it and a task can
 * be linked to from a message. A brand-new, still-untitled task is discarded
 * when the drawer closes without a name.
 */
export function DetailPanelHost() {
  const { taskId, closeTask } = usePanelParams();
  const { data: task, isLoading } = useTask(taskId);
  const { data: projects } = useProjects();
  const qc = useQueryClient();

  const { deleteTask } = useTaskMutations(
    task && task.isPrivate
      ? { kind: "private", personalProjectId: task.personalProjectId ?? "", ownerId: task.ownerId ?? "" }
      : { kind: "project", projectId: task && !task.isPrivate ? task.projectId ?? "" : "" },
  );

  const closeAndDiscardBlank = useCallback(() => {
    if (taskId) {
      const rows = qc.getQueriesData<TaskDTO[]>({ queryKey: ["tasks"] }).flatMap(([, r]) => r ?? []);
      const open = rows.find((r) => r.id === taskId);
      if (open && isBlankStub(open, rows)) {
        deleteTask.mutate({ id: open.id, removed: [open] });
      }
    }
    closeTask();
  }, [taskId, qc, deleteTask, closeTask]);

  const project = task ? (projects ?? []).find((p) => p.id === task.projectId) ?? null : null;

  return (
    <Drawer
      open={Boolean(taskId)}
      onClose={closeAndDiscardBlank}
      label="Task"
      header={
        task ? (
          <div className="flex min-w-0 items-center gap-2">
            {task.assigneeName ? <Face name={task.assigneeName} size="sm" /> : null}
            <span className="truncate text-micro font-medium text-muted">{task.isPrivate ? "My notes" : project?.name ?? "Task"}</span>
          </div>
        ) : (
          <span className="text-micro font-medium text-muted">Task</span>
        )
      }
    >
      {task ? (
        task.isPrivate ? (
          <p className="p-4 text-sm text-muted">Private notes open in My notes.</p>
        ) : (
          <TaskDrawer task={task} />
        )
      ) : isLoading ? (
        <div className="space-y-3 p-4" aria-hidden>
          <div className="h-7 w-2/3 animate-pulse rounded bg-hover" />
          <div className="h-5 w-1/3 animate-pulse rounded bg-hover" />
          <div className="h-24 animate-pulse rounded bg-hover" />
        </div>
      ) : (
        <p className="p-4 text-sm text-muted">That task no longer exists.</p>
      )}
    </Drawer>
  );
}
