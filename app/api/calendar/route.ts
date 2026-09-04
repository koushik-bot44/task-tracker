import { NextResponse } from "next/server";
import { z } from "zod";
import { dateState } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { isExecutiveRole, isManagerRole } from "@/lib/roles";
import { visibleProjectIds } from "@/lib/project-visibility";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import type { CalendarDeadlineDTO, CalendarPayload, CalendarTaskDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime().or(z.string().date()),
  to: z.string().datetime().or(z.string().date()),
  projects: z.string().optional(),
});

/**
 * One payload for the whole calendar window: task dates, meetings (reviews
 * included, with everyone's replies), and project deadlines. Three queries.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const visible = await visibleProjectIds(user);
  const isManager = isManagerRole(user.role);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? "",
    to: url.searchParams.get("to") ?? "",
    projects: url.searchParams.get("projects") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad calendar range" }, { status: 400 });
  }

  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);
  const requested = parsed.data.projects
    ? parsed.data.projects.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const projectIds = visible ? (requested ?? [...visible]).filter((id) => visible.has(id)) : requested;

  const [taskRows, eventRows, deadlineRows] = await Promise.all([
    prisma.task.findMany({
      where: {
        deletedAt: null,
        isPrivate: false,
        archived: false,
        parentId: null,
        dueDate: { gte: from, lte: to },
        ...(projectIds ? { projectId: { in: projectIds } } : {}),
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        dueProvisional: true,
        projectId: true,
        project: { select: { color: true, slug: true } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        date: { gte: from, lte: to },
        OR: [
          { isMeeting: false, ...(projectIds ? { OR: [{ projectId: { in: projectIds } }, { projectId: null }] } : {}) },
          {
            isMeeting: true,
            OR: [
              { attendees: { some: { userId: user.id } } },
              { createdById: user.id },
              ...(isManager ? (projectIds ? [{ projectId: { in: projectIds } }] : [{}]) : []),
            ],
          },
        ],
      },
      include: eventInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.project.findMany({
      where: { deadline: { gte: from, lte: to }, ...(projectIds ? { id: { in: projectIds } } : {}) },
      select: { id: true, name: true, slug: true, deadline: true, color: true },
    }),
  ]);

  const tasks: CalendarTaskDTO[] = taskRows
    .filter((t) => t.dueDate !== null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: (t.dueDate as Date).toISOString(),
      status: t.status,
      dateState: dateState((t.dueDate as Date).toISOString(), t.status),
      dueProvisional: t.dueProvisional,
      projectId: t.projectId ?? "",
      projectColor: t.project?.color ?? "",
      projectSlug: t.project?.slug ?? "",
    }));

  const deadlines: CalendarDeadlineDTO[] = deadlineRows.map((p) => ({
    projectId: p.id,
    name: p.name,
    slug: p.slug,
    deadline: (p.deadline as Date).toISOString(),
    color: p.color,
  }));

  const payload: CalendarPayload = {
    tasks,
    events: eventRows.map((e) => eventToDTO(e, { id: user.id, canReschedule: isExecutiveRole(user.role) })),
    deadlines,
  };
  return NextResponse.json(payload);
});
