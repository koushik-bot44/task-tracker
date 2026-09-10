/**
 * Who may open an attached file (2026-09-10). It opens for the person who
 * uploaded it — it may still be waiting in their composer — and for anyone who
 * can see a place that holds it: a note on a project, a milestone or a task
 * (a team note only for the team), a project's logo, a task's result. Anyone
 * else is told there is nothing there.
 */
import { assertCanSeeTarget } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { canSeeProject } from "@/lib/project-visibility";
import { isStaffOnTask } from "@/lib/work/access";
import { requireSee } from "@/lib/work/tasks";

type Viewer = Parameters<typeof requireSee>[0];

/** True when the check neither throws (a 403/404 on the way) nor answers false. */
async function passes(check: () => Promise<unknown>): Promise<boolean> {
  try {
    return (await check()) !== false;
  } catch {
    return false;
  }
}

export async function canOpenFile(user: Viewer, url: string, uploadedBy: string | null): Promise<boolean> {
  if (uploadedBy && uploadedBy === user.id) return true;
  const [held, comments, taskNotes, logos, results] = await Promise.all([
    prisma.commentAttachment.findMany({
      where: { url },
      take: 25,
      select: { comment: { select: { targetType: true, targetId: true } }, activity: { select: { taskId: true, visibility: true } } },
    }),
    prisma.comment.findMany({ where: { attachmentUrl: url }, take: 25, select: { targetType: true, targetId: true } }),
    prisma.taskActivity.findMany({ where: { attachmentUrl: url }, take: 25, select: { taskId: true, visibility: true } }),
    prisma.project.findMany({ where: { logoUrl: url }, take: 25, select: { id: true } }),
    prisma.task.findMany({ where: { deliverableUrl: url }, take: 25, select: { id: true } }),
  ]);

  const notes = [...comments, ...held.flatMap((h) => (h.comment ? [h.comment] : []))];
  for (const n of notes) {
    if (await passes(() => assertCanSeeTarget(user, n.targetType, n.targetId))) return true;
  }
  const onTasks = [...taskNotes, ...held.flatMap((h) => (h.activity ? [h.activity] : []))];
  for (const a of onTasks) {
    const seen = await passes(async () => {
      const { scope, root } = await requireSee(user, a.taskId);
      return a.visibility === "PUBLIC" || (await isStaffOnTask(user, root, scope));
    });
    if (seen) return true;
  }
  for (const p of logos) {
    if (await passes(() => canSeeProject(user, p.id))) return true;
  }
  for (const t of results) {
    if (await passes(() => requireSee(user, t.id))) return true;
  }
  return false;
}
