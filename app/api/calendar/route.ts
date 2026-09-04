import { NextResponse } from "next/server";
import { z } from "zod";
import { dateState } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { isManagerRole } from "@/lib/roles";
import { visibleProjectIds } from "@/lib/project-visibility";
import type { CalendarEventDTO, CalendarPayload, CalendarTaskDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime().or(z.string().date()),
  to: z.string().datetime().or(z.string().date()),
  projects: z.string().optional(),
});

/**
 * One payload for the whole calendar window. Everyone views (managers, leads,
 * devs). Exactly TWO queries — tasks and events — each joining its relations in
 * the same round trip (no N+1): task -> project.color, event -> project + author.
 *
 * The task list respects the project filter. Events returned are those in the
 * filter OR global (null project); the client's "Global events" toggle hides
 * the globals if the viewer wants only project meetings.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const visible = await visibleProjectIds(user);
  // The whole phase-48 chain schedules: a scheduling authority additionally
  // sees the meetings on any tool they can see (executives: every tool).
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
  // A developer's selection is narrowed to what they may see; managers/leads
  // (visible === null) keep whatever they asked for.
  const projectIds = visible ? (requested ?? [...visible]).filter((id) => visible.has(id)) : requested;

  const [taskRows, eventRows] = await Promise.all([
    prisma.task.findMany({
      where: {
        deletedAt: null,
        // Private personal tasks (phase 15) never appear on the calendar, even
        // a lead's — they carry a null projectId, which would also crash the
        // project.color read below.
        isPrivate: false,
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
        project: { select: { color: true } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        date: { gte: from, lte: to },
        OR: [
          // Plain events keep the old broad visibility: any tool you can see,
          // plus global (null-project) all-hands.
          { isMeeting: false, ...(projectIds ? { OR: [{ projectId: { in: projectIds } }, { projectId: null }] } : {}) },
          // Meetings (phase 22) are ATTENDEE-based: you see one only if you're on
          // its invitee list — a deselected member never sees it. A scheduling
          // MANAGER additionally sees the meetings on any tool they can see.
          {
            isMeeting: true,
            OR: [
              { attendees: { some: { userId: user.id } } },
              // A restricted authority (HOD/manager) sees meetings on their
              // visible tools; an executive (null = all) sees every meeting.
              ...(isManager ? (projectIds ? [{ projectId: { in: projectIds } }] : [{}]) : []),
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        date: true,
        startTime: true,
        endTime: true,
        isMeeting: true,
        projectId: true,
        createdById: true,
        createdAt: true,
        project: { select: { name: true, color: true } },
        createdBy: { select: { name: true } },
        attendees: { select: { userId: true, user: { select: { name: true } } } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const tasks: CalendarTaskDTO[] = taskRows
    .filter((t) => t.dueDate !== null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: (t.dueDate as Date).toISOString(),
      status: t.status,
      dateState: dateState(t.dueDate ? (t.dueDate as Date).toISOString() : null, t.status),
      dueProvisional: t.dueProvisional,
      // Non-null in practice (isPrivate:false excludes null-project tasks); the
      // fallbacks keep the types honest without a bang.
      projectId: t.projectId ?? "",
      projectColor: t.project?.color ?? "",
    }));

  const events: CalendarEventDTO[] = eventRows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date.toISOString(),
    startTime: e.startTime,
    endTime: e.endTime,
    isMeeting: e.isMeeting,
    projectId: e.projectId,
    projectName: e.project?.name ?? null,
    projectColor: e.project?.color ?? null,
    isGlobal: e.projectId === null,
    attendees: e.attendees.map((a) => ({ userId: a.userId, name: a.user.name })),
    createdById: e.createdById,
    createdByName: e.createdBy.name,
    createdAt: e.createdAt.toISOString(),
  }));

  const payload: CalendarPayload = { tasks, events };
  return NextResponse.json(payload);
});
