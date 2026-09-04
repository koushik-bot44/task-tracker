import { prisma } from "@/lib/prisma";
import { projectPeople, reviewAttendeeIds } from "@/lib/project-people";

/** "HH:MM" 24-hour. Used to validate a meeting's start/end times. */
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Review meetings sit at 11:00 IST (the owner's rule). */
export const REVIEW_START = "11:00";

export type MeetingCandidate = { userId: string; name: string; role: "LEAD" | "RESOURCE" };

/**
 * The people who can be invited to a meeting on a project: everyone ON the
 * project (lib/project-people), lead first. ONE definition, reused by the
 * schedule sheet's face row AND by the create/edit endpoints to validate that
 * a submitted attendee actually belongs to the project.
 */
export async function meetingAttendeeCandidates(projectId: string): Promise<MeetingCandidate[]> {
  const people = await projectPeople(projectId);
  return people.map((p) => ({ userId: p.id, name: p.name, role: p.isLead ? "LEAD" : "RESOURCE" }));
}

/** Narrow submitted attendee ids to the project's real, active candidates. */
export async function validAttendeeIds(projectId: string, submitted: string[]): Promise<string[]> {
  const ok = new Set((await meetingAttendeeCandidates(projectId)).map((c) => c.userId));
  return [...new Set(submitted)].filter((id) => ok.has(id));
}

/** A calendar day (YYYY-MM-DD or ISO) as that day's UTC midnight — how events are stored. */
export function eventDay(input: string | Date): Date {
  const key = typeof input === "string" ? input.slice(0, 10) : input.toISOString().slice(0, 10);
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Keep a milestone's review meeting in step with the milestone (restructure).
 * Creates it when missing; moves it when the date changed (clearing every
 * reply, since a moved meeting is a new question); refreshes the attendee
 * list (founder + lead + everyone holding a task in the milestone) without
 * touching the replies of people who were already invited.
 */
export async function syncReviewMeeting(milestoneId: string, actorId: string): Promise<void> {
  const m = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: {
      id: true,
      name: true,
      reviewDate: true,
      projectId: true,
      reviewEventId: true,
      project: { select: { name: true } },
      reviewEvent: { select: { id: true, date: true, attendees: { select: { userId: true } } } },
    },
  });
  if (!m) return;
  const wanted = await reviewAttendeeIds(m.projectId, m.id);
  const title = `${m.name} review`;
  const date = eventDay(m.reviewDate);

  if (!m.reviewEvent) {
    const created = await prisma.calendarEvent.create({
      data: {
        title,
        description: `Review of ${m.name} · ${m.project.name}`,
        date,
        startTime: REVIEW_START,
        isMeeting: true,
        projectId: m.projectId,
        milestoneId: m.id,
        createdById: actorId,
        attendees: { create: wanted.map((userId) => ({ userId })) },
      },
      select: { id: true },
    });
    await prisma.milestone.update({ where: { id: m.id }, data: { reviewEventId: created.id } });
    return;
  }

  const moved = m.reviewEvent.date.getTime() !== date.getTime();
  const have = new Set(m.reviewEvent.attendees.map((a) => a.userId));
  const add = wanted.filter((id) => !have.has(id));
  const remove = [...have].filter((id) => !wanted.includes(id));
  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({
      where: { id: m.reviewEvent!.id },
      data: { title, date, milestoneId: m.id, projectId: m.projectId, startTime: REVIEW_START },
    });
    if (remove.length) await tx.eventAttendee.deleteMany({ where: { eventId: m.reviewEvent!.id, userId: { in: remove } } });
    if (add.length) await tx.eventAttendee.createMany({ data: add.map((userId) => ({ eventId: m.reviewEvent!.id, userId })), skipDuplicates: true });
    if (moved) await tx.eventAttendee.updateMany({ where: { eventId: m.reviewEvent!.id }, data: { response: null, respondedAt: null } });
  });
}

/** Re-sync every review meeting of a project whose attendee set may have changed (a task was given/moved). */
export async function syncProjectReviews(projectId: string, actorId: string): Promise<void> {
  const ms = await prisma.milestone.findMany({ where: { projectId }, select: { id: true } });
  for (const m of ms) await syncReviewMeeting(m.id, actorId);
}

/** The next `n` working days (Mon–Fri) strictly after `from`, as UTC-midnight event days. */
export function nextWorkingDays(from: Date, n = 3): Date[] {
  const out: Date[] = [];
  const d = eventDay(from);
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(new Date(d));
  }
  return out;
}
