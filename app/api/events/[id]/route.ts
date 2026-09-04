import { NextResponse } from "next/server";
import { z } from "zod";
import { notifyEvent } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { canSeeProject } from "@/lib/project-visibility";
import { HHMM_RE, eventDay, validAttendeeIds } from "@/lib/meetings";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { isExecutiveRole } from "@/lib/roles";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(HHMM_RE),
    endTime: z.string().regex(HHMM_RE).nullable(),
    attendeeIds: z.array(z.string().min(1)),
  })
  .partial();

/**
 * Edit a meeting. A moved date clears every reply (a moved meeting is a new
 * question). A review meeting's date is the milestone's — move it from the
 * project page, which keeps the two in step.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can edit a meeting");
  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  const existing = await prisma.calendarEvent.findUnique({ where: { id: params.id } });
  if (!existing) throw new HttpError(404, "Meeting not found");
  if (existing.projectId && !(await canSeeProject(actor, existing.projectId))) {
    throw new HttpError(404, "Meeting not found");
  }
  if (existing.milestoneId && patch.date !== undefined) {
    throw new HttpError(400, "Move a review from the project page — its date is the milestone's.");
  }

  const newDate = patch.date !== undefined ? eventDay(patch.date) : existing.date;
  const dateChanged = newDate.getTime() !== existing.date.getTime();

  let nextAttendees: string[] | null = null;
  if (existing.isMeeting) {
    const nextStart = patch.startTime !== undefined ? patch.startTime : existing.startTime;
    const nextEnd = patch.endTime !== undefined ? patch.endTime : existing.endTime;
    if (nextStart && nextEnd && nextEnd <= nextStart) {
      throw new HttpError(400, "The end time must be after the start time.");
    }
    if (patch.attendeeIds !== undefined && existing.projectId) {
      nextAttendees = await validAttendeeIds(existing.projectId, patch.attendeeIds);
      if (nextAttendees.length === 0) throw new HttpError(400, "Pick at least one person.");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({
      where: { id: params.id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.date !== undefined ? { date: newDate } : {}),
        ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
        ...(patch.endTime !== undefined ? { endTime: patch.endTime } : {}),
      },
    });
    if (nextAttendees) {
      const keep = await tx.eventAttendee.findMany({ where: { eventId: params.id, userId: { in: nextAttendees } } });
      await tx.eventAttendee.deleteMany({ where: { eventId: params.id, userId: { notIn: nextAttendees } } });
      const have = new Set(keep.map((k) => k.userId));
      const add = nextAttendees.filter((id) => !have.has(id));
      if (add.length) await tx.eventAttendee.createMany({ data: add.map((userId) => ({ eventId: params.id, userId })) });
    }
    if (dateChanged) await tx.eventAttendee.updateMany({ where: { eventId: params.id }, data: { response: null, respondedAt: null } });
    return tx.calendarEvent.findUnique({ where: { id: params.id }, include: eventInclude });
  });
  if (!updated) throw new HttpError(404, "Meeting not found");

  await notifyEvent(updated, dateChanged ? "moved" : "updated", updated.project?.name ?? null);
  return NextResponse.json(eventToDTO(updated, { id: actor.id, canReschedule: isExecutiveRole(actor.role) }));
});

/** Cancel a meeting (attendees get a bell row). A review meeting is deleted with its milestone, not here. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can cancel a meeting");
  const existing = await prisma.calendarEvent.findUnique({ where: { id: params.id }, include: eventInclude });
  if (!existing) throw new HttpError(404, "Meeting not found");
  if (existing.projectId && !(await canSeeProject(actor, existing.projectId))) {
    throw new HttpError(404, "Meeting not found");
  }
  if (existing.milestoneId) throw new HttpError(400, "A review goes with its milestone — delete the milestone instead.");
  await notifyEvent(existing, "cancelled", existing.project?.name ?? null);
  await prisma.calendarEvent.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
