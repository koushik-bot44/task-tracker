import { NextResponse } from "next/server";
import { z } from "zod";
import { notifyEvent } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { canSeeProject } from "@/lib/project-visibility";
import { HHMM_RE, eventDay, validAttendeeIds } from "@/lib/meetings";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* "+ Schedule meeting": a project, the faces, a day and a time. Stored as
   that day's UTC midnight so a meeting is "on the 15th" for everyone. */
const createSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(200),
  description: z.string().max(4000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  projectId: z.string().min(1),
  startTime: z.string().regex(HHMM_RE, "time must be HH:MM"),
  endTime: z.string().regex(HHMM_RE, "time must be HH:MM").nullable().optional(),
  attendeeIds: z.array(z.string().min(1)),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  assertManager(user, "Only a manager can schedule a meeting");
  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const { title, description, date, projectId, startTime, endTime, attendeeIds } = parsed.data;

  const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!exists) throw new HttpError(400, "That project does not exist");
  if (!(await canSeeProject(user, projectId))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (endTime && endTime <= startTime) {
    throw new HttpError(400, "The end time must be after the start time.");
  }
  const attendees = await validAttendeeIds(projectId, attendeeIds);
  if (attendees.length === 0) throw new HttpError(400, "Pick at least one person.");

  const created = await prisma.calendarEvent.create({
    data: {
      title,
      description: description ?? "",
      date: eventDay(date),
      startTime,
      endTime: endTime ?? null,
      isMeeting: true,
      projectId,
      createdById: user.id,
      attendees: { create: attendees.map((userId) => ({ userId })) },
    },
    include: eventInclude,
  });

  await notifyEvent(created, "created", created.project?.name ?? null);
  return NextResponse.json(eventToDTO(created, { id: user.id, canReschedule: true }), { status: 201 });
});
