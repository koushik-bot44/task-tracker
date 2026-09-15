import { validCompanyAttendeeIds } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

/**
 * A meeting on a task is the task's alone (owner, 2026-09-11): it invites —
 * and so tells — only the people on the task and whoever organises it. Anyone
 * else named is left out, however they were named.
 */

/** Everybody on the task, whoever asked for it, and whoever gave it. */
export async function taskPeopleIds(taskId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    // One task carries its people now, instead of a record each (owner, 2026-09-15).
    select: { assigneeId: true, requesterId: true, givenById: true, people: { select: { userId: true } } },
  });
  if (!task) return ids;
  for (const id of [task.assigneeId, task.requesterId, task.givenById]) if (id) ids.add(id);
  for (const p of task.people) ids.add(p.userId);
  return ids;
}

/** The named people who may be invited to a task's meeting: the task's own, the organiser, active accounts only. */
export async function validTaskAttendeeIds(taskId: string, requested: readonly string[], organiserId: string): Promise<string[]> {
  const allowed = await taskPeopleIds(taskId);
  allowed.add(organiserId);
  return validCompanyAttendeeIds(requested.filter((id) => allowed.has(id)));
}
