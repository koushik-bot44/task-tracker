import { getBaseUrl } from "@/lib/base-url";
import { reviewResultEmail, taskGivenEmail, taskResolvedEmail, tomorrowEmail, type EmailBody, type TomorrowEmailInput } from "@/lib/email-templates";
import { formatISTDate } from "@/lib/timezone";

/**
 * The three messages Orbit sends (restructure), each built ONCE for every
 * channel: the bell/push line, the email, the WhatsApp text and the two
 * template variables the Twilio ContentSid path fills.
 *
 *   (a) task_given    → the assignee, instantly.
 *   (b) tomorrow      → one per person at 18:00 IST, only when there is something.
 *   (c) review_result → everyone on the project, when the founder records an outcome.
 */
export type MessageKind = "task_given" | "tomorrow" | "review_result" | "task_resolved";

export type OutboundMessage = {
  kind: MessageKind;
  /** What the dedupe key is about (task id, day key, milestone id). */
  refId: string;
  keyExtra?: string;
  /** Work model: the task / meeting the bell row is about. */
  taskId?: string | null;
  eventId?: string | null;
  title: string;
  body: string;
  url: string;
  tag: string;
  email: EmailBody;
  whatsapp: string;
  vars: Record<string, string>;
};

/**
 * (a) task_given. Work model: a task may have no project, and the message is
 * deduped per hand-over (`keyExtra` = the assignment's activity id), so two
 * overlapping saves cannot send it twice.
 */
export function taskGivenMessage(o: {
  taskId: string;
  taskRef: string;
  taskNumber: number;
  taskTitle: string;
  projectName: string | null;
  giverName: string;
  dueDate: Date | null;
  /** The assignment activity id; falls back to the instant. */
  handoverId?: string;
}): OutboundMessage {
  const url = `/work/${o.taskNumber}`;
  const when = o.dueDate ? formatISTDate(o.dueDate) : "no date yet";
  const abs = `${getBaseUrl()}${url}`;
  const where = o.projectName ? ` · ${o.projectName}` : "";
  return {
    kind: "task_given",
    refId: o.taskId,
    keyExtra: o.handoverId ?? String(Date.now()),
    taskId: o.taskId,
    title: `${o.giverName} gave you a task`,
    body: `${o.taskRef} ${o.taskTitle}${where} · by ${when}`,
    url,
    tag: `task-${o.taskId}`,
    email: taskGivenEmail({ taskRef: o.taskRef, taskTitle: o.taskTitle, projectName: o.projectName, giverName: o.giverName, dueDate: o.dueDate, url: abs }),
    whatsapp: [`✅ *${o.giverName} gave you a task*`, "", `${o.taskRef} ${o.taskTitle}`, `${o.projectName ?? "Direct"} · by ${when}`, "", `Open: ${abs}`].join("\n"),
    vars: { "1": `${o.giverName} gave you a task: ${o.taskRef} ${o.taskTitle}${where}`, "2": `By ${when}` },
  };
}

/** (d) task_resolved — to whoever asked, so they can close it or send it back. */
export function taskResolvedMessage(o: {
  taskId: string;
  taskRef: string;
  taskNumber: number;
  taskTitle: string;
  resolverName: string;
  resolutionLabel: string;
  resolutionNotes: string | null;
  activityId: string;
}): OutboundMessage {
  const url = `/work/${o.taskNumber}`;
  const abs = `${getBaseUrl()}${url}`;
  return {
    kind: "task_resolved",
    refId: o.taskId,
    keyExtra: o.activityId,
    taskId: o.taskId,
    title: `${o.resolverName} resolved ${o.taskRef}`,
    body: `${o.taskTitle} · ${o.resolutionLabel}${o.resolutionNotes ? ` · ${o.resolutionNotes}` : ""}`,
    url,
    tag: `task-${o.taskId}`,
    email: taskResolvedEmail({ taskRef: o.taskRef, taskTitle: o.taskTitle, resolverName: o.resolverName, resolutionLabel: o.resolutionLabel, resolutionNotes: o.resolutionNotes, url: abs }),
    whatsapp: [`✅ *${o.resolverName} resolved ${o.taskRef}*`, "", o.taskTitle, o.resolutionLabel, ...(o.resolutionNotes ? [o.resolutionNotes] : []), "", `Close it or send it back: ${abs}`].join("\n"),
    vars: { "1": `${o.resolverName} resolved ${o.taskRef} ${o.taskTitle}`, "2": o.resolutionLabel },
  };
}

export function tomorrowMessage(o: TomorrowEmailInput & { dayKey: string }): OutboundMessage {
  const base = getBaseUrl();
  const lines: string[] = [];
  const bits: string[] = [];
  if (o.meetings.length) bits.push(`${o.meetings.length} ${o.meetings.length === 1 ? "meeting" : "meetings"}`);
  if (o.dueTomorrow.length) bits.push(`${o.dueTomorrow.length} due`);
  if (o.overdueCount) bits.push(`${o.overdueCount} late`);
  const headline = `Tomorrow: ${bits.join(" · ")}`;

  lines.push(`📅 *${o.dayLabel}*`);
  if (o.meetings.length) {
    lines.push("");
    for (const m of o.meetings) {
      lines.push(`*${m.title}* · ${m.projectName} · ${m.time}`);
      lines.push(`I'll be there: ${m.yesUrl}`);
      lines.push(`Can't: ${m.noUrl}`);
    }
  }
  if (o.dueTomorrow.length) {
    lines.push("", "*Due tomorrow*");
    for (const t of o.dueTomorrow) lines.push(`• ${t.title} · ${t.projectName}`);
  }
  if (o.overdueCount) lines.push("", `⚠️ ${o.overdueCount} ${o.overdueCount === 1 ? "task is" : "tasks are"} late: ${o.overdueUrl}`);
  lines.push("", `Today: ${base}/`);

  return {
    kind: "tomorrow",
    refId: o.dayKey,
    title: headline,
    body: [
      ...o.meetings.map((m) => `${m.title} · ${m.time}`),
      ...o.dueTomorrow.map((t) => `Due: ${t.title}`),
      ...(o.overdueCount ? [`${o.overdueCount} late`] : []),
    ]
      .slice(0, 3)
      .join(" · "),
    url: "/",
    tag: `tomorrow-${o.dayKey}`,
    email: tomorrowEmail(o),
    whatsapp: lines.join("\n"),
    vars: { "1": headline, "2": o.meetings.length ? `${o.meetings[0].title} — reply from Orbit: ${base}/` : `Open Today: ${base}/` },
  };
}

export function reviewResultMessage(o: {
  milestoneId: string;
  milestoneName: string;
  projectName: string;
  projectSlug: string;
  outcomeLabel: string;
  note: string | null;
  progress: number;
  byName: string;
}): OutboundMessage {
  const url = `/project/${o.projectSlug}`;
  const abs = `${getBaseUrl()}${url}`;
  return {
    kind: "review_result",
    refId: o.milestoneId,
    keyExtra: String(Date.now()),
    title: `${o.milestoneName}: ${o.outcomeLabel}`,
    body: `${o.projectName} · ${o.progress}% of tasks done · ${o.byName}${o.note ? ` · ${o.note}` : ""}`,
    url,
    tag: `review-${o.milestoneId}`,
    email: reviewResultEmail({ ...o, url: abs }),
    whatsapp: [
      `${o.outcomeLabel === "On track" ? "🟢" : "🟠"} *${o.milestoneName} review: ${o.outcomeLabel}*`,
      "",
      `${o.projectName} · ${o.progress}% of tasks done · ${o.byName}`,
      ...(o.note ? ["", o.note] : []),
      "",
      `Open: ${abs}`,
    ].join("\n"),
    vars: { "1": `${o.projectName} · ${o.milestoneName}: ${o.outcomeLabel}`, "2": `${o.progress}% of tasks done · ${o.byName}` },
  };
}
