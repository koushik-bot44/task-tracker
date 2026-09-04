import { NextResponse } from "next/server";
import { z } from "zod";
import { notifyEvent } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { canSeeProject } from "@/lib/project-visibility";
import { HHMM_RE, validAttendeeIds } from "@/lib/meetings";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* date is a calendar day (YYYY-MM-DD), stored as that day's UTC midnight so a
   meeting is "on the 15th" for everyone, not tied to one timezone's instant.
   A MEETING (phase 22) additionally requires a project, a start time and at
   least one attendee. */
const createSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(200),
  description: z.string().max(4000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  projectId: z.string().min(1).nullable().optional(),
  isMeeting: z.boolean().optional(),
  startTime: z.string().regex(HHMM_RE, "time must be HH:MM").optional(),
  // nullable: the schedule modal sends `endTime: null` when End is left blank
  // (matches the PATCH schema). `.optional()` alone rejects null -> "Invalid request".
  endTime: z.string().regex(HHMM_RE, "time must be HH:MM").nullable().optional(),
  attendeeIds: z.array(z.string().min(1)).optional(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  assertManager(user, "Only a manager can create events");
  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const { title, description, date, projectId, isMeeting, startTime, endTime, attendeeIds } = parsed.data;

  // A tool-scoped event must be on a tool this manager can see (owner or
  // collaborator); a global event (null project) is any manager's to make.
  if (projectId) {
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) throw new HttpError(400, "That tool does not exist");
    if (!(await canSeeProject(user, projectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  // Meeting validation (phase 22): a meeting is always tool-scoped, has a start
  // time (end optional but must be after start), and at least one real attendee.
  let attendees: string[] = [];
  if (isMeeting) {
    if (!projectId) throw new HttpError(400, "A meeting must be on a project.");
    if (!startTime) throw new HttpError(400, "A meeting needs a start time.");
    if (endTime && endTime <= startTime) {
      throw new HttpError(400, "The end time must be after the start time.");
    }
    attendees = await validAttendeeIds(projectId, attendeeIds ?? []);
    if (attendees.length === 0) throw new HttpError(400, "Pick at least one attendee.");
  }

  const created = await prisma.calendarEvent.create({
    data: {
      title,
      description: description ?? "",
      date: new Date(`${date}T00:00:00.000Z`),
      startTime: isMeeting ? startTime : null,
      endTime: isMeeting ? endTime ?? null : null,
      isMeeting: Boolean(isMeeting),
      projectId: projectId ?? null,
      createdById: user.id,
      ...(attendees.length ? { attendees: { create: attendees.map((userId) => ({ userId })) } } : {}),
    },
    include: eventInclude,
  });

  await notifyEvent(created, "created", created.project?.name ?? null);

  return NextResponse.json(eventToDTO(created), { status: 201 });
});
