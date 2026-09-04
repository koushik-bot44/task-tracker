import type { CommentTarget, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessTask, canSeeProject } from "@/lib/project-visibility";
import { HttpError } from "@/lib/session";

/**
 * One door for every note thread: may this user read/write notes on this
 * target? A project or milestone follows project visibility; a task follows
 * canAccessTask (so a private My notes task stays its owner's). 404 either way.
 */
export async function assertCanSeeTarget(user: { id: string; role: Role }, targetType: CommentTarget, targetId: string): Promise<void> {
  if (targetType === "PROJECT") {
    if (!(await canSeeProject(user, targetId))) throw new HttpError(404, "Not found");
    return;
  }
  if (targetType === "MILESTONE") {
    const m = await prisma.milestone.findUnique({ where: { id: targetId }, select: { projectId: true } });
    if (!m || !(await canSeeProject(user, m.projectId))) throw new HttpError(404, "Not found");
    return;
  }
  const t = await prisma.task.findFirst({ where: { id: targetId, deletedAt: null }, select: { isPrivate: true, ownerId: true, projectId: true } });
  if (!t || !(await canAccessTask(user, t))) throw new HttpError(404, "Not found");
}
