import { validCompanyAttendeeIds } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

/**
 * A meeting on a task is the task's alone (owner, 2026-09-11): it invites —
 * and so tells — only the people on the task and whoever organises it. Anyone
 * else named is left out, however they were named.
 */

/** Whoever holds the task (every record of it, when it went to several people), asked for it, or gave it. */
export async function taskPeopleIds(taskId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assigneeId: true, requesterId: true, givenById: true, siblingKey: true } });
  if (!task) return ids;
  for (const id of [task.assigneeId, task.requesterId, task.givenById]) if (id) ids.add(id);
  if (task.siblingKey) {
    const records = await prisma.task.findMany({ where: { siblingKey: task.siblingKey, deletedAt: null }, select: { assigneeId: true } });
    for (const r of records) if (r.assigneeId) ids.add(r.assigneeId);
  }
  return ids;
}

/** The named people who may be invited to a task's meeting: the task's own, the organiser, active accounts only. */
export async function validTaskAttendeeIds(taskId: string, requested: readonly string[], organiserId: string): Promise<string[]> {
  const allowed = await taskPeopleIds(taskId);
  allowed.add(organiserId);
  return validCompanyAttendeeIds(requested.filter((id) => allowed.has(id)));
}
