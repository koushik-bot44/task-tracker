import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { isExecutiveRole, isManagerRole } from "@/lib/roles";
import { visibleProjectIds } from "@/lib/project-visibility";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import type { CalendarDeadlineDTO, CalendarPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime().or(z.string().date()),
  to: z.string().datetime().or(z.string().date()),
  projects: z.string().optional(),
});

/**
 * One payload for the whole calendar window: meetings (reviews included, with
 * everyone's replies) and project deadlines — nothing else. Task dates used to
 * be here and buried the two things people come for (owner, 2026-09-08).
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

  const [eventRows, deadlineRows] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: eventWhere,
      include: eventInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.project.findMany({
      where: { deadline: { gte: from, lte: to }, ...(projectIds ? { id: { in: projectIds } } : {}) },
      select: { id: true, name: true, slug: true, deadline: true, color: true },
    }),
  ]);

  const deadlines: CalendarDeadlineDTO[] = deadlineRows.map((p) => ({
    projectId: p.id,
    name: p.name,
    slug: p.slug,
    deadline: (p.deadline as Date).toISOString(),
    color: p.color,
  }));

  const payload: CalendarPayload = {
    events: eventRows.map((e) => eventToDTO(e, { id: user.id, canReschedule: isExecutiveRole(user.role) })),
    deadlines,
  };
  return NextResponse.json(payload);
});
