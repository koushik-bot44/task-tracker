import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { sendEmail } from "@/lib/email";
import { sendWhatsAppToUsers, whatsAppConfigured } from "@/lib/whatsapp";
import { eventEmail, projectAddedEmail } from "@/lib/email-templates";
import { getBaseUrl } from "@/lib/base-url";
import { formatDMY } from "@/lib/dates";
import { istDayKey } from "@/lib/timezone";

/**
 * Meeting notifications (phase 8). When a manager creates, moves or cancels an
 * event, the SCOPED people hear about it — in the in-app bell (a durable
 * Notification row) and, if they enabled it, a push. Push is fire-and-forget:
 * it never blocks or throws into the create/edit/delete response.
 *
 * Recipient rule — the one place it is defined:
 *   - a project-tagged event  -> the project's lead + everyone assigned to a
 *     task in that project.
 *   - a global (all-hands) event -> every active lead and developer.
 *   - never the manager who made the change; never a disabled account; deduped.
 */

type EventRow = {
  id: string;
  title: string;
  date: Date;
  projectId: string | null;
  createdById: string;
  // Meetings (phase 22): recipients come from the explicit attendee list, and
  // the time rides along into the bell body + email.
  isMeeting?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  // Bumped on every edit — the "updated" email dedupes on it so each real edit
  // mails once (the bell always fires).
  updatedAt?: Date;
  // Present when the caller has the full event (for the email body).
  description?: string;
  createdBy?: { name: string } | null;
};

/**
 * A generic notification to specific users (phase 14): a durable bell row plus a
 * fire-and-forget push. Used for collaboration invites and password-reset
 * requests, which reuse the same two channels the calendar does.
 */
export async function notifyUsers(
  userIds: string[],
  n: { type: string; title: string; body: string; url: string; tag: string },
): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: { url: n.url },
    })),
  });
  void sendPushToUsers(ids, { title: n.title, body: n.body, url: n.url, tag: n.tag });
}

/**
 * Phase 29 — tell a user they were added to a project, as a developer MEMBER or
 * as the LEAD. The in-app bell + push always fire (the bell is on for everyone);
 * the EMAIL is opt-in and deduped per project+user+role via EmailLog. Awaited but
 * fully guarded (email failures are swallowed by sendEmail) so it never blocks
 * destructively or 500s the add — on serverless, awaiting is what makes the send
 * actually complete (a fire-and-forget send is frozen after the response). A
 * brand-new INVITED user is NOT sent this — their invite email already names the
 * project (call sites decide). Never notifies the actor about themselves.
 */
export async function notifyAddedToProject(opts: {
  userId: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  role: "member" | "lead";
  addedById: string;
  addedByName: string;
}): Promise<void> {
  if (opts.userId === opts.addedById) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, emailOptIn: true, disabledAt: true },
    });
    if (!user || user.disabledAt) return;

    const roleLabel = opts.role === "lead" ? "Team lead" : "Developer";
    const path = `/t/${opts.projectSlug}`;
    await notifyUsers([opts.userId], {
      type: "project.added",
      title: `Added to ${opts.projectName}`,
      body: `You're now ${roleLabel.toLowerCase()} on ${opts.projectName}.`,
      url: path,
      tag: `project-added-${opts.projectId}`,
    });
    if (user.emailOptIn) {
      const body = projectAddedEmail({
        projectName: opts.projectName,
        roleLabel,
        addedByName: opts.addedByName,
        url: `${getBaseUrl()}${path}`,
      });
      await sendEmail({
        to: user.email,
        subject: body.subject,
        html: body.html,
        text: body.text,
        dedupeKey: `project_added:${opts.projectId}:${opts.userId}:${opts.role}`,
        userId: opts.userId,
        kind: "project_added",
        refId: opts.projectId,
      });
    }
  } catch (err) {
    console.error("[notify] project-added failed:", (err as Error).message);
  }
}

export async function recipientsForEvent(event: EventRow): Promise<string[]> {
  // A MEETING (phase 22) is driven by its EXPLICIT attendee list, not the broad
  // scope — exactly the selected invitees, minus the creator and any disabled
  // account. A deselected member has no EventAttendee row and hears nothing.
  if (event.isMeeting) {
    const rows = await prisma.eventAttendee.findMany({
      where: { eventId: event.id },
      select: { userId: true },
    });
    const ids = new Set(rows.map((r) => r.userId));
    ids.delete(event.createdById);
    if (ids.size === 0) return [];
    const active = await prisma.user.findMany({
      where: { id: { in: [...ids] }, disabledAt: null },
      select: { id: true },
    });
    return active.map((u) => u.id);
  }

  const ids = new Set<string>();

  if (event.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: event.projectId },
      select: { leadId: true },
    });
    if (project?.leadId) ids.add(project.leadId);

    const assignees = await prisma.task.findMany({
      where: { projectId: event.projectId, assigneeId: { not: null }, deletedAt: null },
      select: { assigneeId: true },
      distinct: ["assigneeId"],
    });
    for (const a of assignees) if (a.assigneeId) ids.add(a.assigneeId);
  } else {
    const workers = await prisma.user.findMany({
      where: { role: { in: ["TEAM_LEAD", "RESOURCE"] }, disabledAt: null },
      select: { id: true },
    });
    for (const u of workers) ids.add(u.id);
  }

  ids.delete(event.createdById);
  if (ids.size === 0) return [];

  // The scoped path can pull in a disabled lead/assignee — filter them here so
  // both paths share one "active only" guarantee.
  const active = await prisma.user.findMany({
    where: { id: { in: [...ids] }, disabledAt: null },
    select: { id: true },
  });
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
 * Notify the event's recipients. Notification rows are written synchronously
 * (they are the reliable in-app record); the push is fired without awaiting.
 */
export async function notifyEvent(
  event: EventRow,
  kind: EventKind,
  projectName: string | null,
): Promise<{ recipients: string[] }> {
  const recipients = await recipientsForEvent(event);
  if (recipients.length === 0) return { recipients };

  const title = HEADLINE[kind](event.title);
  const timePart =
    event.isMeeting && event.startTime
      ? ` · ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
      : "";
  const body = `${formatDMY(event.date.toISOString())}${timePart} · ${projectName ?? "All-hands"}`;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: `event.${kind}`,
      title,
      body,
      data: { url: "/calendar", eventId: event.id },
    })),
  });

  // Fire-and-forget: sendPushToUsers already swallows its own failures.
  void sendPushToUsers(recipients, { title, body, url: "/calendar", tag: `event-${event.id}` });

  // Email is a THIRD channel beside the bell and push, for recipients who have
  // it on. It reuses the SAME recipient set — scoping is never recomputed.
  // AWAITED (not fire-and-forget): on serverless, work started after the HTTP
  // response can be frozen and delivered late — the cause of the slow/missing
  // mail. Bounded by the transport's own timeouts; it never throws in here, but
  // guard anyway so a mail failure can never 500 the create/edit/cancel.
  try {
    await emailEventRecipients(event, kind, projectName, recipients);
  } catch (err) {
    console.error("[notify] email send failed:", (err as Error).message);
  }

  // WhatsApp (phase 32) is a FURTHER channel beside bell/push/email, again on the
  // SAME recipient set — narrowed inside the sender to people who have a phone AND
  // whatsappOptIn. Awaited + guarded (Twilio errors, incl. sandbox non-join, are
  // swallowed by the sender) so it can never 500 the create/edit/cancel. No-ops
  // entirely when TWILIO_* is unset.
  try {
    await whatsAppEventRecipients(event, kind, projectName, recipients);
  } catch (err) {
    console.error("[notify] whatsapp send failed:", (err as Error).message);
  }

  return { recipients };
}

const WA_HEADLINE: Record<EventKind, (title: string) => string> = {
  created: (t) => `📅 New meeting: ${t}`,
  moved: (t) => `🕑 Meeting moved: ${t}`,
  cancelled: (t) => `❌ Meeting cancelled: ${t}`,
  updated: (t) => `🔁 Meeting updated: ${t}`,
};

/** The freeform WhatsApp text (sandbox). Production swaps to an approved template
    inside lib/whatsapp's buildMessageParams — this body stays the caller's input. */
function whatsAppEventBody(
  event: EventRow,
  kind: EventKind,
  projectName: string | null,
  departmentName: string | null,
): string {
  const when = formatDMY(event.date.toISOString());
  const time = event.startTime
    ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
    : "";
  const lines = [
    WA_HEADLINE[kind](event.title),
    "",
    `*Project:* ${projectName ?? "All-hands"}${departmentName ? ` · ${departmentName}` : ""}`,
    `*When:* ${when}${time ? ` · ${time}` : ""}`,
  ];
  const desc = event.description?.trim();
  if (desc) lines.push("", desc);
  lines.push("", `Open Orbit: ${getBaseUrl()}/calendar`);
  return lines.join("\n");
}

async function whatsAppEventRecipients(
  event: EventRow,
  kind: EventKind,
  projectName: string | null,
  recipients: string[],
): Promise<void> {
  // Skip the extra department lookup entirely when WhatsApp is off.
  if (!whatsAppConfigured()) return;

  let departmentName: string | null = null;
  if (event.projectId) {
    const proj = await prisma.project
      .findUnique({ where: { id: event.projectId }, select: { department: { select: { name: true } } } })
      .catch(() => null);
    departmentName = proj?.department?.name ?? null;
  }

  const message = whatsAppEventBody(event, kind, projectName, departmentName);
  const logKind =
    kind === "created"
      ? "event_new"
      : kind === "moved"
        ? "event_moved"
        : kind === "updated"
          ? "event_updated"
          : "event_cancelled";
  // Dedupe mirrors email: a move keys on the target day, an edit on the edit
  // timestamp, so each distinct move/edit sends once; create/cancel send once.
  const keyExtra =
    kind === "moved"
      ? istDayKey(event.date)
      : kind === "updated"
        ? String(event.updatedAt?.getTime() ?? 0)
        : undefined;

  // Template variables for the ContentSid path (used when TWILIO_CONTENT_SID is
  // set). Two numbered slots, so they fit a simple 2-variable meeting template:
  //   {{1}} = what + where, {{2}} = when. The freeform `message` above is the
  //   fallback when no template is configured.
  const label =
    kind === "created" ? "New meeting" : kind === "moved" ? "Meeting moved" : kind === "updated" ? "Meeting updated" : "Meeting cancelled";
  const time = event.startTime ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}` : "";
  const context = [projectName ?? "All-hands", departmentName].filter(Boolean).join(" · ");
  const vars = {
    "1": `${label}: ${event.title}${context ? ` (${context})` : ""}`,
    "2": `${formatDMY(event.date.toISOString())}${time ? ` · ${time}` : ""}`,
  };
  await sendWhatsAppToUsers(recipients, message, { kind: logKind, refId: event.id, keyExtra, vars });
}

async function emailEventRecipients(
  event: EventRow,
  kind: EventKind,
  projectName: string | null,
  recipients: string[],
): Promise<void> {
  const emailKind =
    kind === "created"
      ? "event_new"
      : kind === "moved"
        ? "event_moved"
        : kind === "updated"
          ? "event_updated"
          : "event_cancelled";
  const users = await prisma.user
    .findMany({ where: { id: { in: recipients }, emailOptIn: true, disabledAt: null }, select: { id: true, email: true } })
    .catch(() => []);
  if (users.length === 0) return;

  const body = eventEmail(
    emailKind,
    {
      title: event.title,
      description: event.description ?? "",
      date: event.date,
      createdByName: event.createdBy?.name ?? "A manager",
      startTime: event.startTime ?? null,
      endTime: event.endTime ?? null,
    },
    projectName,
  );

  await Promise.all(
    users.map((u) =>
      sendEmail({
        to: u.email,
        subject: body.subject,
        html: body.html,
        text: body.text,
        // A move keys on the target day, an update on the edit timestamp, so
        // each distinct move/edit mails once; create/cancel mail at most once.
        dedupeKey:
          kind === "moved"
            ? `event_moved:${event.id}:${u.id}:${istDayKey(event.date)}`
            : kind === "updated"
              ? `event_updated:${event.id}:${u.id}:${event.updatedAt?.getTime() ?? 0}`
              : `${emailKind}:${event.id}:${u.id}`,
        userId: u.id,
        kind: emailKind,
        refId: event.id,
      }),
    ),
  );
}
