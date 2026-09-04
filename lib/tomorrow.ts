import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/base-url";
import { replyLinks } from "@/lib/meeting-reply";
import { tomorrowMessage, type OutboundMessage } from "@/lib/messages";
import { sendMessage } from "@/lib/notify";
import { formatISTDate, istDayKey, istDayRange } from "@/lib/timezone";

/**
 * Message (b): ONE message per person, the evening before, listing their tasks
 * due tomorrow, how many are late, and tomorrow's reviews/meetings with signed
 * reply links. Nothing to say → no message. Idempotent per (person, day).
 */
export type TomorrowPlan = { userId: string; message: OutboundMessage };

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Build the digest for everyone who has something tomorrow. `now` is injectable for the rig. */
export async function buildTomorrow(now = new Date()): Promise<TomorrowPlan[]> {
  const base = getBaseUrl();
  const tomorrowKey = istDayKey(addDays(now, 1));
  const { start, end } = istDayRange(tomorrowKey);
  const todayEnd = istDayRange(istDayKey(now)).end;
  // Events are stored as UTC midnight of the calendar day.
  const eventDay = new Date(`${tomorrowKey}T00:00:00.000Z`);

  const [due, overdue, meetings] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null, isPrivate: false, archived: false, parentId: null, status: { not: "DONE" }, assigneeId: { not: null }, dueDate: { gte: start, lte: end } },
      select: { id: true, title: true, assigneeId: true, project: { select: { name: true, slug: true } } },
    }),
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: { deletedAt: null, isPrivate: false, archived: false, parentId: null, status: { not: "DONE" }, assigneeId: { not: null }, dueDate: { lt: new Date(todayEnd.getTime() - 86_400_000 + 1) } },
      _count: { _all: true },
    }),
    prisma.calendarEvent.findMany({
      where: { isMeeting: true, date: eventDay },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        milestoneId: true,
        project: { select: { name: true } },
        attendees: { select: { id: true, userId: true } },
      },
    }),
  ]);

  const people = new Map<string, { dueTomorrow: { title: string; projectName: string; url: string }[]; overdueCount: number; meetings: { id: string; title: string; projectName: string; time: string; attendeeId: string }[] }>();
  const bucket = (id: string) => {
    let p = people.get(id);
    if (!p) {
      p = { dueTomorrow: [], overdueCount: 0, meetings: [] };
      people.set(id, p);
    }
    return p;
  };
  for (const t of due) {
    if (!t.assigneeId || !t.project) continue;
    bucket(t.assigneeId).dueTomorrow.push({ title: t.title || "Untitled", projectName: t.project.name, url: `${base}/project/${t.project.slug}?task=${t.id}` });
  }
  for (const o of overdue) if (o.assigneeId) bucket(o.assigneeId).overdueCount = o._count._all;
  for (const m of meetings) {
    for (const a of m.attendees) {
      bucket(a.userId).meetings.push({
        id: m.id,
        title: m.title,
        projectName: m.project?.name ?? "Everyone",
        time: `${m.startTime ?? ""}${m.endTime ? `–${m.endTime}` : ""}`.trim() || "time to be set",
        attendeeId: a.id,
      });
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...people.keys()] }, disabledAt: null, status: "ACTIVE", role: { notIn: ["PERSON", "ADMIN"] } },
    select: { id: true, name: true },
  });
  const dayLabel = `tomorrow, ${formatISTDate(addDays(now, 1))}`;

  const plans: TomorrowPlan[] = [];
  for (const u of users) {
    const p = people.get(u.id)!;
    const meetingsWithLinks = await Promise.all(
      p.meetings.map(async (m) => {
        const links = await replyLinks(m.attendeeId);
        return { title: m.title, projectName: m.projectName, time: m.time, yesUrl: links.yes, noUrl: links.no };
      }),
    );
    plans.push({
      userId: u.id,
      message: tomorrowMessage({
        name: u.name,
        dayKey: tomorrowKey,
        dayLabel,
        dueTomorrow: p.dueTomorrow,
        overdueCount: p.overdueCount,
        overdueUrl: `${base}/`,
        meetings: meetingsWithLinks,
      }),
    });
  }
  return plans;
}

/** Build and send. Returns how many people were messaged. */
export async function sendTomorrow(now = new Date()): Promise<{ people: number; sent: number }> {
  const plans = await buildTomorrow(now);
  let sent = 0;
  for (const p of plans) {
    const r = await sendMessage([p.userId], p.message);
    sent += r.recipients;
  }
  return { people: plans.length, sent };
}

/**
 * After a reschedule: re-send the (b)-style message for ONE meeting to its
 * attendees right away, with fresh reply links.
 */
export async function resendForMeeting(eventId: string): Promise<number> {
  const m = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, date: true, startTime: true, endTime: true, project: { select: { name: true } }, attendees: { select: { id: true, userId: true, user: { select: { name: true } } } } },
  });
  if (!m) return 0;
  const base = getBaseUrl();
  const dayKey = istDayKey(m.date);
  let n = 0;
  for (const a of m.attendees) {
    const links = await replyLinks(a.id);
    const msg = tomorrowMessage({
      name: a.user.name,
      dayKey: `${dayKey}:${m.id}`,
      dayLabel: `moved to ${formatISTDate(m.date)}`,
      dueTomorrow: [],
      overdueCount: 0,
      overdueUrl: `${base}/`,
      meetings: [{ title: m.title, projectName: m.project?.name ?? "Everyone", time: `${m.startTime ?? ""}${m.endTime ? `–${m.endTime}` : ""}`.trim(), yesUrl: links.yes, noUrl: links.no }],
    });
    msg.title = `Moved: ${m.title}`;
    msg.keyExtra = String(Date.now());
    const r = await sendMessage([a.userId], msg);
    n += r.recipients;
  }
  return n;
}
