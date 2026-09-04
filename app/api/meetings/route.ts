import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertManager } from "@/lib/permissions";
import { visibleProjectIds } from "@/lib/project-visibility";
import { eventInclude, eventToDTO } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every meeting on a tool the manager can schedule for (phase 22) — the source
 * for the Meetings tab's per-project history and the upcoming badges. Manager-
 * only; a lead/dev is not on the scheduling side (403), an admin is project-blind
 * (visibleProjectIds throws 403). Meetings are returned across all the manager's
 * own + collaborated projects; the client groups them by project/department.
 */
export const GET = route(async () => {
  const actor = await requireUser();
  assertManager(actor, "Only a manager can open the meetings tab");
  const visible = await visibleProjectIds(actor); // a Set for a manager

  const meetings = await prisma.calendarEvent.findMany({
    where: { isMeeting: true, projectId: { in: visible ? [...visible] : [] } },
    include: eventInclude,
    orderBy: { date: "asc" },
  });
  return NextResponse.json(meetings.map(eventToDTO));
});
