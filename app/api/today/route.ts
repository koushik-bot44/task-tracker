import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { visibleProjectIds } from "@/lib/project-visibility";
import { isExecutiveRole } from "@/lib/roles";
import { enrichProjects } from "@/lib/projects";
import { TASK_INCLUDE, eventInclude, eventToDTO, serializeTask, withCounts } from "@/lib/serialize";
import { startOfDay } from "@/lib/dates";
import { istDayKey } from "@/lib/timezone";
import type { TodayDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Today, in one round trip: the company line (executives + HODs), your open
 * tasks (overdue first), and today's + tomorrow's meetings with replies. A
 * review is recorded on the milestone box itself (owner, 2026-09-08).
 */
export const GET = route(async () => {
  const user = await requireUser();
  const visible = await visibleProjectIds(user);
  // The day is the IST day, held as UTC midnight — how meetings and review
  // dates are stored — so a UTC host does not run a day behind until 05:30.
  const today = new Date(`${istDayKey(new Date())}T00:00:00.000Z`);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);
  const weekEnd = new Date(today);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const quarter = new Date(today);
  quarter.setUTCDate(quarter.getUTCDate() + 90);
  const projectFilter = visible ? { projectId: { in: [...visible] } } : {};

  const [tasks, events, projects] = await Promise.all([
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
      include: { ...TASK_INCLUDE, project: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.calendarEvent.findMany({
      where: {
        isMeeting: true,
        // Stored as UTC midnight of the calendar day. A quarter ahead, narrowed
        // below to today + tomorrow plus a later meeting somebody can't make and
        // this person can move. Two weeks was too short: a "Can't" on a review a
        // month out never reached the organiser (owner, 2026-09-08).
        date: { gte: today, lt: quarter },
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

  // Today + tomorrow. A later meeting appears only when it is waiting on THIS
  // person to act: somebody said Can't and they are the one who can move it.
  // "I have not replied yet" is not a reason — nobody replies to a review three
  // weeks out, and it put every future review on Today (owner, 2026-09-08).
  const soonCutoff = dayAfterTomorrow.getTime();
  const meetings = events.filter((e) => {
    if (e.date.getTime() < soonCutoff) return true;
    const canMove = isExecutiveRole(user.role) || e.createdById === user.id;
    return canMove && e.attendees.some((a) => a.response === "NO");
  });

  const payload: TodayDTO = {
    summary,
    tasks: sorted.map(({ row, project }) => ({ ...serializeTask(row), projectName: project?.name ?? "", projectSlug: project?.slug ?? "" })),
    meetings: meetings.map((e) => eventToDTO(e, { id: user.id, canReschedule: isExecutiveRole(user.role) })),
  };
  return NextResponse.json(payload);
});
