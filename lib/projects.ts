import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/dates";
import { projectPeople } from "@/lib/project-people";
import type { ProjectRow } from "@/lib/serialize";

/**
 * Enrich project rows with what the cards show: task counts, the next
 * milestone, whether it is behind, and the faces. A handful of grouped
 * queries, never one per project.
 *
 * "Behind" = not done AND (past its deadline, OR an overdue task, OR a review
 * date passed with no outcome recorded).
 */
export async function enrichProjects(rows: ProjectRow[]): Promise<ProjectRow[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return rows;
  const today = startOfDay(new Date());
  const [tasks, milestones, people] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: { in: ids }, deletedAt: null, archived: false, parentId: null },
      select: { projectId: true, status: true, dueDate: true },
    }),
    prisma.milestone.findMany({
      where: { projectId: { in: ids } },
      orderBy: [{ reviewDate: "asc" }, { orderKey: "asc" }],
      select: { id: true, projectId: true, name: true, reviewDate: true, outcome: true },
    }),
    Promise.all(ids.map((id) => projectPeople(id))),
  ]);
  const peopleById = new Map(ids.map((id, i) => [id, people[i]]));
  return rows.map((r) => {
    const mine = tasks.filter((t) => t.projectId === r.id);
    const openTasks = mine.filter((t) => t.status !== "DONE").length;
    const doneTasks = mine.filter((t) => t.status === "DONE").length;
    const overdueTasks = mine.filter((t) => t.status !== "DONE" && t.dueDate && startOfDay(t.dueDate) < today).length;
    const ms = milestones.filter((m) => m.projectId === r.id);
    const next = ms.find((m) => m.outcome === null && startOfDay(m.reviewDate) >= today) ?? ms.find((m) => m.outcome === null) ?? null;
    const missedReview = ms.some((m) => m.outcome === null && startOfDay(m.reviewDate) < today);
    const pastDeadline = Boolean(r.deadline && r.status !== "DONE" && startOfDay(r.deadline) < today);
    return {
      ...r,
      openTasks,
      doneTasks,
      overdueTasks,
      nextMilestone: next ? { id: next.id, name: next.name, reviewDate: next.reviewDate } : null,
      behind: r.status !== "DONE" && (pastDeadline || overdueTasks > 0 || missedReview),
      people: peopleById.get(r.id) ?? [],
    };
  });
}
