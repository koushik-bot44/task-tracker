import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notify";
import { requireMentor, route } from "@/lib/session";
import { mentorReportCreateSchema, parseBody } from "@/lib/validation";
import { dayKeyToDate, serializeReport, todayKey } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The bell line: the first 140 characters of what was covered. */
function preview(text: string): string {
  return text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
}

/**
 * The tutor sends a day report after a session: what was covered, homework, a
 * note for the parents. Only against a person they were invited around (else
 * 404), never dated ahead of today. The CEO hears about it on his bell and phone,
 * pointed at Well Being — resolved the way ownership is resolved (the person's
 * manager when that is the CEO, else the CEO accounts), not blindly the manager.
 * The son and the co-parents are NOT written a bell: their walled screens have no
 * bell and never hold a push subscription, so a row there would only sit unread;
 * the homework shows on the son's Today and the report in the parents' Summary.
 */
export const POST = route(async (req: Request) => {
  const user = await requireMentor();

  const parsed = await parseBody(req, mentorReportCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { collaboratorId, date, covered, homework, note } = parsed.data;

  const row = await prisma.routineCollaborator.findFirst({
    where: { id: collaboratorId, managerId: user.id, status: "ACCEPTED", kind: "MENTOR" },
    select: { id: true, subject: true, personId: true, person: { select: { managerId: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (date > todayKey()) return NextResponse.json({ error: "That day has not come yet." }, { status: 400 });

  const subject = row.subject ?? "Session";
  const report = await prisma.mentorReport.create({
    data: { personId: row.personId, collaboratorId: row.id, date: dayKeyToDate(date), subject, covered, homework: homework || null, note: note || null },
    select: { id: true, date: true, subject: true, covered: true, homework: true, note: true, createdAt: true },
  });

  const manager = await prisma.user.findUnique({ where: { id: row.person.managerId }, select: { id: true, role: true } });
  const owners = manager?.role === "FOUNDER"
    ? [manager.id]
    : (await prisma.user.findMany({ where: { role: "FOUNDER", disabledAt: null }, select: { id: true } })).map((u) => u.id);
  await notifyUsers(owners, { type: "routine.report", title: `${subject} report from ${user.name}`, body: preview(covered), tag: `routine-report-${report.id}`, url: "/routine" });

  return NextResponse.json(serializeReport({ ...report, collaborator: { manager: { name: user.name } } }), { status: 201 });
});
