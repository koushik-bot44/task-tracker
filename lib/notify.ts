import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { sendEmail } from "@/lib/email";
import { sendWhatsAppToUsers, whatsAppConfigured } from "@/lib/whatsapp";
import type { OutboundMessage } from "@/lib/messages";
import { formatISTDate } from "@/lib/timezone";

/**
 * The delivery engines (restructure). Three ways out:
 *
 *   bellUsers    a durable in-app Notification row only — the record the bell
 *                shows. Meeting created/moved/cancelled and "someone said Can't"
 *                use this: no email, no WhatsApp, no push.
 *   notifyUsers  bell + push (fire-and-forget). Password-reset requests keep it.
 *   sendMessage  the THREE messages: bell + push + email + WhatsApp, each channel
 *                honouring its own opt-in and deduped per (kind, refId, user).
 *
 * Every send is guarded: a dead SMTP or Twilio never 500s the action.
 */

export type BellInput = {
  type: string;
  title: string;
  body: string;
  url: string;
  data?: Record<string, unknown>;
  /** Work model: the task / meeting this is about, so deletes can sweep it. */
  taskId?: string | null;
  eventId?: string | null;
  /**
   * Work model: when set, the same key never writes the same person twice —
   * a cron re-run or a double tap adds nothing. Stored as `${key}:${userId}`.
   */
  dedupeKey?: string | null;
};

/**
 * Write the bell rows. Returns the ids that actually received one (with a
 * dedupeKey, the people who already had it are left out), so push follows
 * the same list.
 */
export async function bellUsers(userIds: string[], n: BellInput): Promise<string[]> {
  let ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  if (n.dedupeKey) {
    const key = n.dedupeKey;
    const have = await prisma.notification.findMany({
      where: { dedupeKey: { in: ids.map((id) => `${key}:${id}`) } },
      select: { userId: true },
    });
    const seen = new Set(have.map((h) => h.userId));
    ids = ids.filter((id) => !seen.has(id));
    if (ids.length === 0) return [];
  }
  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: { url: n.url, ...(n.data ?? {}) },
      taskId: n.taskId ?? null,
      eventId: n.eventId ?? null,
      dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${userId}` : null,
    })),
    skipDuplicates: true,
  });
  return ids;
}

export async function notifyUsers(userIds: string[], n: BellInput & { tag: string }): Promise<void> {
  const ids = await bellUsers(userIds, n);
  if (ids.length === 0) return;
  void sendPushToUsers(ids, { title: n.title, body: n.body, url: n.url, tag: n.tag });
}

/**
 * Deliver one of the three messages to `userIds` on every channel. The bell
 * row is written synchronously (the reliable record); push is fire-and-forget;
 * email and WhatsApp are AWAITED (serverless freezes work started after the
 * response) but never throw out of here.
 */
export async function sendMessage(userIds: string[], msg: OutboundMessage): Promise<{ recipients: number }> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { recipients: 0 };
  const active = await prisma.user.findMany({
    where: { id: { in: ids }, disabledAt: null, role: { notIn: ["PERSON"] } },
    select: { id: true, email: true, emailOptIn: true },
  });
  if (active.length === 0) return { recipients: 0 };
  const activeIds = active.map((u) => u.id);
  const keyExtra = msg.keyExtra ? `:${msg.keyExtra}` : "";

  // The bell row and push are deduped on the same key as email and WhatsApp
  // (work model): a re-run of the evening digest adds nothing.
  const fresh = await bellUsers(activeIds, {
    type: msg.kind,
    title: msg.title,
    body: msg.body,
    url: msg.url,
    taskId: msg.taskId ?? null,
    eventId: msg.eventId ?? null,
    dedupeKey: `${msg.kind}:${msg.refId}${keyExtra}`,
  });
  if (fresh.length) void sendPushToUsers(fresh, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag });

  try {
    await Promise.all(
      active
        .filter((u) => u.emailOptIn)
        .map((u) =>
          sendEmail({
            to: u.email,
            subject: msg.email.subject,
            html: msg.email.html,
            text: msg.email.text,
            dedupeKey: `${msg.kind}:${msg.refId}:${u.id}${keyExtra}`,
            userId: u.id,
            kind: msg.kind,
            refId: msg.refId,
          }),
        ),
    );
  } catch (err) {
    console.error("[notify] email send failed:", (err as Error).message);
  }

  if (whatsAppConfigured()) {
    try {
      await sendWhatsAppToUsers(activeIds, msg.whatsapp, { kind: msg.kind, refId: msg.refId, keyExtra: msg.keyExtra, vars: msg.vars });
    } catch (err) {
      console.error("[notify] whatsapp send failed:", (err as Error).message);
    }
  }
  return { recipients: activeIds.length };
}

type EventRow = {
  id: string;
  title: string;
  date: Date;
  projectId: string | null;
  createdById: string;
  isMeeting?: boolean;
  startTime?: string | null;
  endTime?: string | null;
};

/**
 * Recipient rule for a meeting row: its explicit attendees, minus the person
 * who made the change, active only. (A legacy plain event with no attendee
 * list reaches the project's lead + task holders.)
 */
export async function recipientsForEvent(event: EventRow): Promise<string[]> {
  const ids = new Set<string>();
  if (event.isMeeting) {
    const rows = await prisma.eventAttendee.findMany({ where: { eventId: event.id }, select: { userId: true } });
    for (const r of rows) ids.add(r.userId);
  } else if (event.projectId) {
    const project = await prisma.project.findUnique({ where: { id: event.projectId }, select: { leadId: true } });
    if (project?.leadId) ids.add(project.leadId);
    const assignees = await prisma.task.findMany({
      where: { projectId: event.projectId, assigneeId: { not: null }, deletedAt: null },
      select: { assigneeId: true },
      distinct: ["assigneeId"],
    });
    for (const a of assignees) if (a.assigneeId) ids.add(a.assigneeId);
  }
  ids.delete(event.createdById);
  if (ids.size === 0) return [];
  const active = await prisma.user.findMany({ where: { id: { in: [...ids] }, disabledAt: null }, select: { id: true } });
  return active.map((u) => u.id);
}

type EventKind = "created" | "moved" | "cancelled" | "updated";

const HEADLINE: Record<EventKind, (title: string) => string> = {
  created: (t) => `New meeting: ${t}`,
  moved: (t) => `Meeting moved: ${t}`,
  cancelled: (t) => `Meeting cancelled: ${t}`,
  updated: (t) => `Meeting updated: ${t}`,
};

/**
 * A meeting changed. BELL ONLY (restructure): the evening-before "tomorrow"
 * message is the reminder people receive; this is just the in-app record.
 */
export async function notifyEvent(event: EventRow, kind: EventKind, projectName: string | null): Promise<{ recipients: string[] }> {
  const recipients = await recipientsForEvent(event);
  if (recipients.length === 0) return { recipients };
  const timePart = event.isMeeting && event.startTime ? ` · ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}` : "";
  await bellUsers(recipients, {
    type: `event.${kind}`,
    title: HEADLINE[kind](event.title),
    body: `${formatISTDate(event.date)}${timePart} · ${projectName ?? "Everyone"}`,
    url: "/calendar",
    data: { eventId: event.id },
    eventId: event.id,
  });
  return { recipients };
}
