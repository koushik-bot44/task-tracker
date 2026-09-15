import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { isExecutiveRole, isManagerRole } from "@/lib/roles";
import { visibleProjectIds } from "@/lib/project-visibility";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { loadScope } from "@/lib/work/access";
import { filterWhere } from "@/lib/work/query";
import { workRef, type CalendarDeadlineDTO, type CalendarPayload, type CalendarTaskDateDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime().or(z.string().date()),
  to: z.string().datetime().or(z.string().date()),
  projects: z.string().optional(),
});

/**
 * One payload for the whole calendar window: meetings (reviews included, with
 * everyone's replies), project deadlines, and the tasks that fall due.
 *
 * Task dates were taken off on 2026-09-08 because they buried the two things
 * people come for; they are back on 2026-09-15 as a separate, quieter kind that
 * sorts last, so a busy day still shows its meetings first. They are read
 * through the WORK MODEL's own visibility (loadScope + filterWhere), not the
 * project rules the meetings use — a task with no project still belongs to
 * somebody, and the work rules are the only ones that know who.
 *
 * Filtering by a project means THAT project: a meeting of your own on another
 * project no longer leaks through (owner, 2026-09-08).
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

  const mine = [{ attendees: { some: { userId: user.id } } }, { createdById: user.id }];
  const seesEveryMeeting = visible === null || isManager;
  const eventWhere: Record<string, unknown> = { date: { gte: from, lte: to } };
  if (requested) {
    // Exactly the projects asked for. A meeting with no project (the company,
    // a department, a one-to-one) belongs to none of them.
    eventWhere.projectId = { in: projectIds ?? [] };
    if (!seesEveryMeeting) eventWhere.OR = mine;
  } else if (visible === null) {
    // The CEO sees the whole company's calendar.
  } else if (isManager) {
    eventWhere.OR = [{ projectId: { in: projectIds ?? [] } }, ...mine];
  } else {
    eventWhere.OR = mine;
  }

  // An account that has no work of its own (accounts admin, a plain person) has
  // no work scope to load — asking for one throws, so it simply gets no dates.
  const hasWork = user.role !== "ADMIN" && user.role !== "PERSON";
  const scope = hasWork ? await loadScope(user) : null;

  const [eventRows, deadlineRows, taskRows] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: eventWhere,
      include: eventInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.project.findMany({
      where: { deadline: { gte: from, lte: to }, ...(projectIds ? { id: { in: projectIds } } : {}) },
      select: { id: true, name: true, slug: true, deadline: true, color: true },
    }),
    scope
      ? prisma.task.findMany({
          where: {
            AND: [
              // Open work only, and only what this person may see anyway.
              filterWhere(user, scope, { dueFrom: from.toISOString(), dueTo: to.toISOString() }),
              // Asked for certain projects means those projects, as with meetings.
              requested ? { projectId: { in: projectIds ?? [] } } : {},
            ],
          },
          select: { id: true, number: true, type: true, title: true, dueDate: true, project: { select: { name: true, slug: true } } },
          orderBy: [{ dueDate: "asc" }, { number: "asc" }],
          take: 400,
        })
      : Promise.resolve([]),
  ]);

  const deadlines: CalendarDeadlineDTO[] = deadlineRows.map((p) => ({
    projectId: p.id,
    name: p.name,
    slug: p.slug,
    deadline: (p.deadline as Date).toISOString(),
    color: p.color,
  }));

  const taskDates: CalendarTaskDateDTO[] = taskRows.map((t) => ({
    id: t.id,
    number: t.number,
    ref: workRef(t.type, t.number),
    title: t.title,
    dueDate: (t.dueDate as Date).toISOString(),
    projectName: t.project?.name ?? null,
    projectSlug: t.project?.slug ?? null,
  }));

  const payload: CalendarPayload = {
    events: eventRows.map((e) => eventToDTO(e, { id: user.id, canReschedule: isExecutiveRole(user.role) })),
    deadlines,
    taskDates,
  };
  return NextResponse.json(payload);
});
