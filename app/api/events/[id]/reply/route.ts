import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bellUsers } from "@/lib/notify";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { isExecutiveRole } from "@/lib/roles";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";
import { formatISTDate } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const bodySchema = z.object({ response: z.enum(["YES", "NO"]) });

/**
 * [I'll be there] / [Can't] from Today or the day panel (signed in). The
 * same column the emailed link writes. A "Can't" tells the organiser (bell
 * row) so they can reschedule.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const row = await prisma.eventAttendee.findUnique({
    where: { eventId_userId: { eventId: params.id, userId: user.id } },
    include: { event: { select: { id: true, title: true, date: true, createdById: true, project: { select: { name: true } } } } },
  });
  if (!row) throw new HttpError(404, "You're not on this meeting.");

  await prisma.eventAttendee.update({
    where: { id: row.id },
    data: { response: parsed.data.response, respondedAt: new Date() },
  });

  if (parsed.data.response === "NO" && row.event.createdById !== user.id) {
    await bellUsers([row.event.createdById], {
      type: "meeting.cant",
      title: `${user.name} can't make ${row.event.title}`,
      body: `${formatISTDate(row.event.date)} · ${row.event.project?.name ?? "Everyone"} — reschedule from Today`,
      url: "/",
      data: { eventId: row.event.id },
    });
  }

  const updated = await prisma.calendarEvent.findUnique({ where: { id: params.id }, include: eventInclude });
  return NextResponse.json(eventToDTO(updated!, { id: user.id, canReschedule: isExecutiveRole(user.role) }));
});
