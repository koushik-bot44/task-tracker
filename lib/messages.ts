import { getBaseUrl } from "@/lib/base-url";
import { reviewResultEmail, taskGivenEmail, tomorrowEmail, type EmailBody, type TomorrowEmailInput } from "@/lib/email-templates";
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
export type MessageKind = "task_given" | "tomorrow" | "review_result";

export type OutboundMessage = {
  kind: MessageKind;
  /** What the dedupe key is about (task id, day key, milestone id). */
  refId: string;
  keyExtra?: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  email: EmailBody;
  whatsapp: string;
  vars: Record<string, string>;
};

export function taskGivenMessage(o: {
  taskId: string;
  taskTitle: string;
  projectName: string;
  projectSlug: string;
  giverName: string;
  dueDate: Date | null;
}): OutboundMessage {
  const url = `/project/${o.projectSlug}?task=${o.taskId}`;
  const when = o.dueDate ? formatISTDate(o.dueDate) : "no date yet";
  const abs = `${getBaseUrl()}${url}`;
  return {
    kind: "task_given",
    refId: o.taskId,
    keyExtra: String(Date.now()),
    title: `${o.giverName} gave you a task`,
    body: `${o.taskTitle} · ${o.projectName} · by ${when}`,
    url,
    tag: `task-${o.taskId}`,
    email: taskGivenEmail({ taskTitle: o.taskTitle, projectName: o.projectName, giverName: o.giverName, dueDate: o.dueDate, url: abs }),
    whatsapp: [`✅ *${o.giverName} gave you a task*`, "", o.taskTitle, `${o.projectName} · by ${when}`, "", `Open: ${abs}`].join("\n"),
    vars: { "1": `${o.giverName} gave you a task: ${o.taskTitle} (${o.projectName})`, "2": `By ${when}` },
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
    body: `${o.projectName} · ${o.byName} set ${o.progress}%${o.note ? ` · ${o.note}` : ""}`,
    url,
    tag: `review-${o.milestoneId}`,
    email: reviewResultEmail({ ...o, url: abs }),
    whatsapp: [
      `${o.outcomeLabel === "On track" ? "🟢" : "🟠"} *${o.milestoneName} review: ${o.outcomeLabel}*`,
      "",
      `${o.projectName} · ${o.byName} set ${o.progress}%`,
      ...(o.note ? ["", o.note] : []),
      "",
      `Open: ${abs}`,
    ].join("\n"),
    vars: { "1": `${o.projectName} · ${o.milestoneName}: ${o.outcomeLabel}`, "2": `${o.byName} set ${o.progress}%` },
  };
}
