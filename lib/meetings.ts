import { prisma } from "@/lib/prisma";

/** "HH:MM" 24-hour. Used to validate a meeting's start/end times. */
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type MeetingCandidate = { userId: string; name: string; role: "LEAD" | "RESOURCE" };

/**
 * The people who can be invited to a meeting on a project (phase 22): the
 * project's LEAD, its developer members, and anyone assigned a live task in it —
 * deduped, active only, lead first. ONE definition, reused by the schedule
 * modal's candidate list AND by the create/edit endpoints to validate that a
 * submitted attendee actually belongs to the project (so a manager can't invite
 * an arbitrary user id).
 */
export async function meetingAttendeeCandidates(projectId: string): Promise<MeetingCandidate[]> {
  const [project, members, assigned] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { lead: { select: { id: true, name: true, disabledAt: true } } },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { user: { select: { id: true, name: true, disabledAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: { projectId, assigneeId: { not: null }, deletedAt: null, isPrivate: false },
      select: { assignee: { select: { id: true, name: true, disabledAt: true } } },
      distinct: ["assigneeId"],
    }),
  ]);

  const out: MeetingCandidate[] = [];
  const seen = new Set<string>();
  const add = (u: { id: string; name: string; disabledAt: Date | null } | null | undefined, role: MeetingCandidate["role"]) => {
    if (!u || u.disabledAt || seen.has(u.id)) return;
    seen.add(u.id);
    out.push({ userId: u.id, name: u.name, role });
  };

  add(project?.lead ?? null, "LEAD");
  for (const m of members) add(m.user, "RESOURCE");
  for (const a of assigned) add(a.assignee, "RESOURCE");
  return out;
}

/** Narrow submitted attendee ids to the project's real, active candidates
    (deduped). The endpoints reject the request if this is empty. */
export async function validAttendeeIds(projectId: string, submitted: string[]): Promise<string[]> {
  const ok = new Set((await meetingAttendeeCandidates(projectId)).map((c) => c.userId));
  return [...new Set(submitted)].filter((id) => ok.has(id));
}
