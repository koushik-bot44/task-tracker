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

type Params = { params: { id: string } };

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    projectId: z.string().min(1).nullable(),
    startTime: z.string().regex(HHMM_RE),
    endTime: z.string().regex(HHMM_RE).nullable(),
    attendeeIds: z.array(z.string().min(1)),
  })
  .partial();

/**
 * Edit an event or meeting. A plain EVENT re-notifies only on a DATE change
 * ("Meeting moved"). A MEETING re-notifies its CURRENT attendee set on any save
 * ("Meeting updated") — so newly-added attendees are told and removed ones (no
 * longer in the set) are not; the bell always fires, the email dedupes per edit.
 * Manager only, owner-or-collaborator of the project.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can edit events");
  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  const existing = await prisma.calendarEvent.findUnique({ where: { id: params.id } });
  if (!existing) throw new HttpError(404, "Event not found");
  // Can't touch a tool-scoped event on a tool you can't see.
  if (existing.projectId && !(await canSeeProject(actor, existing.projectId))) {
    throw new HttpError(404, "Event not found");
  }

  if (patch.projectId) {
    const exists = await prisma.project.findUnique({ where: { id: patch.projectId }, select: { id: true } });
    if (!exists) throw new HttpError(400, "That tool does not exist");
    if (!(await canSeeProject(actor, patch.projectId))) {
      throw new HttpError(404, "Event not found");
    }
  }

  const newDate =
    patch.date !== undefined ? new Date(`${patch.date}T00:00:00.000Z`) : existing.date;
  const dateChanged = newDate.getTime() !== existing.date.getTime();

  // Meeting-specific validation (phase 22): end after start, and a valid, non-
  // empty attendee set when it's being changed.
  let nextAttendees: string[] | null = null;
  if (existing.isMeeting) {
    const nextStart = patch.startTime !== undefined ? patch.startTime : existing.startTime;
    const nextEnd = patch.endTime !== undefined ? patch.endTime : existing.endTime;
    if (nextStart && nextEnd && nextEnd <= nextStart) {
      throw new HttpError(400, "The end time must be after the start time.");
    }
    if (patch.attendeeIds !== undefined) {
      nextAttendees = await validAttendeeIds(existing.projectId!, patch.attendeeIds);
      if (nextAttendees.length === 0) throw new HttpError(400, "Pick at least one attendee.");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({
      where: { id: params.id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.date !== undefined ? { date: newDate } : {}),
        ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
        ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
        ...(patch.endTime !== undefined ? { endTime: patch.endTime } : {}),
      },
    });
    if (nextAttendees) {
      await tx.eventAttendee.deleteMany({ where: { eventId: params.id } });
      await tx.eventAttendee.createMany({ data: nextAttendees.map((userId) => ({ eventId: params.id, userId })) });
    }
    return tx.calendarEvent.findUnique({ where: { id: params.id }, include: eventInclude });
  });
  if (!updated) throw new HttpError(404, "Event not found");

  if (existing.isMeeting) {
    await notifyEvent(updated, "updated", updated.project?.name ?? null);
  } else if (dateChanged) {
    await notifyEvent(updated, "moved", updated.project?.name ?? null);
  }

  return NextResponse.json(eventToDTO(updated));
});

/** Delete an event/meeting. Notifies its recipients ("Meeting cancelled") first,
    while the row (and its attendees) still exist to compute them from — attendee
    rows then cascade with the event. Manager only. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can delete events");

  const existing = await prisma.calendarEvent.findUnique({
    where: { id: params.id },
    include: eventInclude,
  });
  if (!existing) throw new HttpError(404, "Event not found");
  if (existing.projectId && !(await canSeeProject(actor, existing.projectId))) {
    throw new HttpError(404, "Event not found");
  }

  await notifyEvent(existing, "cancelled", existing.project?.name ?? null);
  await prisma.calendarEvent.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
});
