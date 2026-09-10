import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isExecutiveRole } from "@/lib/roles";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { requireSee } from "@/lib/work/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * A task's meetings, oldest first (owner, 2026-09-11): the small calendar on
 * the record marks their days. Whoever can see the task sees when they are.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  await requireSee(user, params.id);
  const events = await prisma.calendarEvent.findMany({
    where: { taskId: params.id, isMeeting: true },
    include: eventInclude,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return NextResponse.json(events.map((e) => eventToDTO(e, { id: user.id, canReschedule: isExecutiveRole(user.role) || e.createdById === user.id })));
});
