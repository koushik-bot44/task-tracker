"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useTask } from "@/lib/hooks/use-tasks";

/**
 * ?task=<id> — an old link, a message, a bookmark — opens the task's full
 * record. The side panel that used to open here (Doing, No milestone, its
 * steps and notes) belonged to the milestone screens the work model replaced,
 * and is gone (owner, 2026-09-11). A private note opens in My space.
 */
export function DetailPanelHost() {
  const router = useRouter();
  const { taskId, closeTask } = usePanelParams();
  const { data: task, isError } = useTask(taskId);

  useEffect(() => {
    if (!taskId) return;
    if (task && task.number > 0) router.replace(task.isPrivate ? "/my-space" : `/work/${task.number}`);
    else if (isError) closeTask();
  }, [taskId, task, isError, router, closeTask]);

  return null;
}
