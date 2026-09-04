import { prisma } from "@/lib/prisma";
import { COMMENT_INCLUDE, serializeComment, type MilestoneRow } from "@/lib/serialize";

/** A project's milestone boxes with task counts and the latest note, in review-date order. */
export async function milestoneRows(projectId: string): Promise<MilestoneRow[]> {
  const ms = await prisma.milestone.findMany({ where: { projectId }, orderBy: [{ reviewDate: "asc" }, { orderKey: "asc" }] });
  if (ms.length === 0) return [];
  const ids = ms.map((m) => m.id);
  const [tasks, notes] = await Promise.all([
    prisma.task.groupBy({
      by: ["milestoneId", "status"],
      where: { projectId, deletedAt: null, archived: false, parentId: null, milestoneId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.comment.findMany({
      where: { targetType: "MILESTONE", targetId: { in: ids } },
      orderBy: { createdAt: "desc" },
      include: COMMENT_INCLUDE,
    }),
  ]);
  return ms.map((m) => {
    const mine = tasks.filter((t) => t.milestoneId === m.id);
    const myNotes = notes.filter((n) => n.targetId === m.id);
    return {
      ...m,
      taskCount: mine.reduce((n, t) => n + t._count._all, 0),
      doneCount: mine.filter((t) => t.status === "DONE").reduce((n, t) => n + t._count._all, 0),
      noteCount: myNotes.length,
      latestNote: myNotes[0] ? serializeComment(myNotes[0]) : null,
    };
  });
}
