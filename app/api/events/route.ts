import { NextResponse } from "next/server";
import { z } from "zod";
import { notifyEvent } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { canSeeProject } from "@/lib/project-visibility";
import { HHMM_RE, eventDay, validAttendeeIds, validCompanyAttendeeIds } from "@/lib/meetings";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { validTaskAttendeeIds } from "@/lib/task-meetings";
import { requireSee } from "@/lib/work/tasks";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* "+ Schedule meeting": what it's about, the faces, a day and a time. Stored
   as that day's UTC midnight so a meeting is "on the 15th" for everyone. No
   project = a department / company / one-on-one meeting (owner, 2026-09-08). */
const createSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(200),
  description: z.string().max(4000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  projectId: z.string().min(1).nullable().optional(),
  startTime: z.string().regex(HHMM_RE, "time must be HH:MM"),
  endTime: z.string().regex(HHMM_RE, "time must be HH:MM").nullable().optional(),
  attendeeIds: z.array(z.string().min(1)),
  /** Scheduled from a task's record: the meeting belongs to that task (owner, 2026-09-11). */
  taskId: z.string().min(1).nullable().optional(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  assertManager(user, "Only a manager can schedule a meeting");
  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const { title, description, date, startTime, endTime, attendeeIds } = parsed.data;
  const projectId = parsed.data.projectId ?? null;
  const taskId = parsed.data.taskId ?? null;

  if (projectId) {
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) throw new HttpError(400, "That project does not exist");
    if (!(await canSeeProject(user, projectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }
  // Only someone who can see the task may put a meeting on it (404 otherwise, like every task route).
  if (taskId) await requireSee(user, taskId);
  if (endTime && endTime <= startTime) {
    throw new HttpError(400, "The end time must be after the start time.");
  }
  // A task's meeting invites — and tells — only the task's people (owner, 2026-09-11).
  const attendees = taskId
    ? await validTaskAttendeeIds(taskId, attendeeIds, user.id)
    : projectId
      ? await validAttendeeIds(projectId, attendeeIds)
      : await validCompanyAttendeeIds(attendeeIds);
  if (attendees.length === 0) throw new HttpError(400, taskId ? "Pick at least one person on the task." : "Pick at least one person.");

  const created = await prisma.calendarEvent.create({
    data: {
      title,
      description: description ?? "",
      date: eventDay(date),
      startTime,
      endTime: endTime ?? null,
      isMeeting: true,
      projectId,
      taskId,
      createdById: user.id,
      attendees: { create: attendees.map((userId) => ({ userId })) },
    },
    include: eventInclude,
  });

  await notifyEvent(created, "created", created.project?.name ?? null);
  return NextResponse.json(eventToDTO(created, { id: user.id, canReschedule: true }), { status: 201 });
});
