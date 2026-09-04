import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { eventDay, nextWorkingDays } from "@/lib/meetings";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { isExecutiveRole } from "@/lib/roles";
import { HttpError, requireUser, route } from "@/lib/session";
import { resendForMeeting } from "@/lib/tomorrow";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

function canReschedule(user: { id: string; role: Parameters<typeof isExecutiveRole>[0] }, createdById: string): boolean {
  return user.id === createdById || isExecutiveRole(user.role);
}

/** The three next working days the organiser can pick from. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const ev = await prisma.calendarEvent.findUnique({ where: { id: params.id }, select: { id: true, date: true, createdById: true } });
  if (!ev) throw new HttpError(404, "Meeting not found");
  if (!canReschedule(user, ev.createdById)) throw new HttpError(403, "Only the organiser can move this meeting.");
  const from = ev.date.getTime() > Date.now() ? ev.date : new Date();
  return NextResponse.json({ slots: nextWorkingDays(from, 3).map((d) => d.toISOString()) });
});

const bodySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}/) });

/**
 * Reschedule after a "Can't": the meeting moves to the chosen day, every
 * reply clears, and a fresh (b)-style message with reply links goes out to
 * the attendees. A review meeting carries its milestone with it.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const ev = await prisma.calendarEvent.findUnique({ where: { id: params.id }, select: { id: true, createdById: true, milestoneId: true } });
  if (!ev) throw new HttpError(404, "Meeting not found");
  if (!canReschedule(user, ev.createdById)) throw new HttpError(403, "Only the organiser can move this meeting.");

  const date = eventDay(parsed.data.date);
  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({ where: { id: ev.id }, data: { date } });
    await tx.eventAttendee.updateMany({ where: { eventId: ev.id }, data: { response: null, respondedAt: null } });
    if (ev.milestoneId) await tx.milestone.update({ where: { id: ev.milestoneId }, data: { reviewDate: date } });
  });
  const resent = await resendForMeeting(ev.id);
  const updated = await prisma.calendarEvent.findUnique({ where: { id: ev.id }, include: eventInclude });
  return NextResponse.json({ event: eventToDTO(updated!, { id: user.id, canReschedule: true }), resent });
});
