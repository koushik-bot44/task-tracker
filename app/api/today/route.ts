import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { visibleProjectIds } from "@/lib/project-visibility";
import { isExecutiveRole } from "@/lib/roles";
import { enrichProjects } from "@/lib/projects";
import { TASK_INCLUDE, eventInclude, eventToDTO, serializeTask, withCounts } from "@/lib/serialize";
import { startOfDay } from "@/lib/dates";
import type { NeedsOkDTO, TodayDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Today, in one round trip: the company line (executives + HODs), your open
 * tasks (overdue first), today's + tomorrow's meetings with replies, and the
 * founder/director's reviews waiting for an outcome.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const visible = await visibleProjectIds(user);
  const today = startOfDay(new Date());
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const twoWeeks = new Date(today);
  twoWeeks.setDate(twoWeeks.getDate() + 14);
  const projectFilter = visible ? { projectId: { in: [...visible] } } : {};

  const [tasks, events, projects, reviews] = await Promise.all([
    prisma.task.findMany({
      where: {
        deletedAt: null,
        isPrivate: false,
        archived: false,
        parentId: null,
        status: { not: "DONE" },
        assigneeId: user.id,
        ...projectFilter,
      },
      include: { ...TASK_INCLUDE, project: { select: { name: true, slug: true } } },
    }),
    prisma.calendarEvent.findMany({
      where: {
        isMeeting: true,
        // Stored as UTC midnight of the calendar day. Two weeks out; narrowed below to
        // today + tomorrow plus anything later that still needs this person (no reply
        // yet, or a "Can't" the organiser has to act on — so a moved meeting never
        // drops out of sight before it is settled).
        date: { gte: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())), lt: new Date(Date.UTC(twoWeeks.getFullYear(), twoWeeks.getMonth(), twoWeeks.getDate())) },
        OR: [{ attendees: { some: { userId: user.id } } }, { createdById: user.id }],
      },
      include: eventInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    isExecutiveRole(user.role) || user.role === "HOD"
      ? prisma.project.findMany({
          where: { ...(visible ? { id: { in: [...visible] } } : {}), status: { not: "DONE" } },
          include: { lead: { select: { id: true, name: true } } },
        })
      : Promise.resolve(null),
    isExecutiveRole(user.role)
      ? prisma.milestone.findMany({
          where: { outcome: null, reviewDate: { lt: new Date(today.getTime() + 86_400_000) } },
          include: { project: { select: { id: true, name: true, slug: true, status: true, progressManual: true } } },
          orderBy: { reviewDate: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Steps + note counts for the rows.
  const ids = tasks.map((t) => t.id);
  const [steps, notes] = await Promise.all([
    ids.length ? prisma.task.findMany({ where: { parentId: { in: ids }, deletedAt: null }, select: { id: true, parentId: true, status: true, deletedAt: true } }) : [],
    ids.length ? prisma.comment.groupBy({ by: ["targetId"], where: { targetType: "TASK", targetId: { in: ids } }, _count: { _all: true } }) : [],
  ]);
  const noteCounts = new Map(notes.map((n) => [n.targetId, n._count._all]));
  const rows = withCounts([...tasks, ...steps.map((s) => ({ ...tasks[0], ...s }))], noteCounts).slice(0, tasks.length);
  const sorted = rows
    .map((r, i) => ({ row: r, project: tasks[i].project }))
    .sort((a, b) => {
      const ad = a.row.dueDate ? startOfDay(a.row.dueDate).getTime() : Infinity;
      const bd = b.row.dueDate ? startOfDay(b.row.dueDate).getTime() : Infinity;
      return ad - bd || Number(b.row.important) - Number(a.row.important) || a.row.orderKey.localeCompare(b.row.orderKey);
    });

  let summary: TodayDTO["summary"] = null;
  if (projects) {
    const rich = await enrichProjects(projects);
    const reviewsThisWeek = await prisma.milestone.count({
      where: { projectId: { in: projects.map((p) => p.id) }, outcome: null, reviewDate: { gte: today, lt: weekEnd } },
    });
    summary = { projects: rich.length, behind: rich.filter((p) => p.behind).length, reviewsThisWeek };
  }

  let needsOk: NeedsOkDTO[] = [];
  if (reviews.length) {
    const [counts, projectCounts] = await Promise.all([
      prisma.task.groupBy({
        by: ["milestoneId", "status"],
        where: { milestoneId: { in: reviews.map((r) => r.id) }, deletedAt: null, archived: false, parentId: null },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: reviews.map((r) => r.project.id) }, deletedAt: null, archived: false, parentId: null },
        _count: { _all: true },
      }),
    ]);
    // The project's number: the CEO's own when set by hand, else tasks done ÷ tasks.
    const projectProgress = (projectId: string, status: string, manual: number | null) => {
      if (manual !== null) return manual;
      if (status === "DONE") return 100;
      const rows = projectCounts.filter((c) => c.projectId === projectId);
      const total = rows.reduce((n, c) => n + c._count._all, 0);
      const done = rows.filter((c) => c.status === "DONE").reduce((n, c) => n + c._count._all, 0);
      return total === 0 ? 0 : Math.round((done / total) * 100);
    };
    needsOk = reviews.map((r) => {
      const mine = counts.filter((c) => c.milestoneId === r.id);
      return {
        milestoneId: r.id,
        milestoneName: r.name,
        projectId: r.project.id,
        projectName: r.project.name,
        projectSlug: r.project.slug,
        reviewDate: r.reviewDate.toISOString(),
        progress: projectProgress(r.project.id, r.project.status, r.project.progressManual),
        tasksDone: mine.filter((c) => c.status === "DONE").reduce((n, c) => n + c._count._all, 0),
        tasksTotal: mine.reduce((n, c) => n + c._count._all, 0),
      };
    });
  }

  // Today + tomorrow always; a later meeting only while it still needs this
  // person: they have not replied, or someone said Can't and they can move it.
  const soonCutoff = Date.UTC(dayAfterTomorrow.getFullYear(), dayAfterTomorrow.getMonth(), dayAfterTomorrow.getDate());
  const meetings = events.filter((e) => {
    if (e.date.getTime() < soonCutoff) return true;
    const mine = e.attendees.find((a) => a.userId === user.id);
    if (mine && mine.response === null) return true;
    const canMove = isExecutiveRole(user.role) || e.createdById === user.id;
    return canMove && e.attendees.some((a) => a.response === "NO");
  });

  const payload: TodayDTO = {
    summary,
    tasks: sorted.map(({ row, project }) => ({ ...serializeTask(row), projectName: project?.name ?? "", projectSlug: project?.slug ?? "" })),
    meetings: meetings.map((e) => eventToDTO(e, { id: user.id, canReschedule: isExecutiveRole(user.role) })),
    needsOk,
  };
  return NextResponse.json(payload);
});
