import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canSeeProject } from "@/lib/project-visibility";
import { canManageProject } from "@/lib/project-people";
import { eventDay, syncProvisionalTaskDates, syncReviewMeeting } from "@/lib/meetings";
import { milestoneRows } from "@/lib/milestones";
import { notifyEvent } from "@/lib/notify";
import { resendForMeeting } from "@/lib/tomorrow";
import { serializeMilestone } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody, updateMilestoneSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function load(actorId: string, role: Parameters<typeof canSeeProject>[0]["role"], id: string) {
  const m = await prisma.milestone.findUnique({ where: { id }, select: { id: true, projectId: true, reviewEventId: true, reviewDate: true } });
  if (!m || !(await canSeeProject({ id: actorId, role }, m.projectId))) throw new HttpError(404, "Milestone not found");
  return m;
}

/** Rename, or move the review date (which moves the meeting and clears replies). */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  const m = await load(actor.id, actor.role, params.id);
  if (!(await canManageProject(actor, m.projectId))) throw new HttpError(403, "Only the people running this project can change a milestone.");

  const parsed = await parseBody(req, updateMilestoneSchema);
  if (!parsed.ok) return parsed.response;
  const data: { name?: string; reviewDate?: Date; orderKey?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.orderKey !== undefined) data.orderKey = parsed.data.orderKey;
  if (parsed.data.reviewDate !== undefined) {
    const d = new Date(parsed.data.reviewDate);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Pick a review date" }, { status: 400 });
    data.reviewDate = eventDay(d);
  }
  await prisma.milestone.update({ where: { id: params.id }, data });
  if (data.reviewDate) await syncProvisionalTaskDates(params.id, data.reviewDate);
  await syncReviewMeeting(params.id, actor.id);
  // A moved review is a new question for its people: the same "Moved:" message
  // with fresh reply links that Postpone sends (work model — this path was silent).
  const moved = Boolean(data.reviewDate && eventDay(m.reviewDate).getTime() !== data.reviewDate.getTime());
  if (moved) {
    const after = await prisma.milestone.findUnique({ where: { id: params.id }, select: { reviewEventId: true } });
    if (after?.reviewEventId) await resendForMeeting(after.reviewEventId).catch((err) => console.error("[milestones] moved message failed:", (err as Error).message));
  }
  const row = (await milestoneRows(m.projectId)).find((r) => r.id === params.id);
  return NextResponse.json(serializeMilestone(row!));
});

/** Delete a box: its tasks move to "Not in a milestone yet"; its review meeting goes with it. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();
  const m = await load(actor.id, actor.role, params.id);
  if (!(await canManageProject(actor, m.projectId))) throw new HttpError(403, "Only the people running this project can delete a milestone.");
  // Its people hear the meeting is off before it goes (bell only, like any cancel).
  if (m.reviewEventId) {
    const ev = await prisma.calendarEvent.findUnique({ where: { id: m.reviewEventId }, include: { project: { select: { name: true } } } });
    if (ev) await notifyEvent(ev, "cancelled", ev.project?.name ?? null).catch(() => undefined);
  }
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({ where: { milestoneId: params.id }, data: { milestoneId: null } });
    // Its notes go with it (Comment has no FK to follow).
    await tx.comment.deleteMany({ where: { targetType: "MILESTONE", targetId: params.id } });
    // deleteMany: a missing row must not abort the transaction (a swallowed delete did).
    if (m.reviewEventId) await tx.calendarEvent.deleteMany({ where: { id: m.reviewEventId } });
    await tx.milestone.delete({ where: { id: params.id } });
  });
  return NextResponse.json({ ok: true });
});
