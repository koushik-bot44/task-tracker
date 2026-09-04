import { getBaseUrl } from "@/lib/base-url";
import { formatISTDate } from "@/lib/timezone";

/**
 * Email bodies — plain text + minimal inline-styled HTML. Colours mirror the
 * app tokens as literal hex because inline email styles cannot reference CSS
 * variables; this is the one intentional place for hex outside globals.css.
 *
 * Restructure: exactly THREE work messages (task given, tomorrow, review
 * result) plus the account mail (invite). Every other template is gone.
 */

const APP_URL = getBaseUrl();

const C = {
  bg: "#f6f4ef",
  surface: "#ffffff",
  ink: "#1c1b18",
  muted: "#6b6862",
  primary: "#2563eb",
  onPrimary: "#ffffff",
  line: "#e8e4dc",
  ok: "#166534",
  danger: "#b91c1c",
};

export type EmailBody = { subject: string; html: string; text: string };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Cta = { label: string; url: string; tone?: "primary" | "quiet" };

export function layout(opts: {
  heading: string;
  /** Pre-escaped HTML paragraphs / lists. */
  bodyHtml?: string;
  rows?: [string, string][];
  ctas: Cta[];
  note?: string;
  footer?: string;
}): string {
  const font = "font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const rowsHtml = (opts.rows ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:${C.muted};font-size:15px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0;color:${C.ink};font-size:15px">${v}</td></tr>`,
    )
    .join("");
  const ctas = opts.ctas
    .map((c) =>
      c.tone === "quiet"
        ? `<a href="${c.url}" style="display:inline-block;background:${C.bg};color:${C.ink};text-decoration:none;${font};font-size:15px;font-weight:600;padding:12px 18px;border-radius:12px;margin:0 8px 8px 0">${c.label}</a>`
        : `<a href="${c.url}" style="display:inline-block;background:${C.primary};color:${C.onPrimary};text-decoration:none;${font};font-size:15px;font-weight:600;padding:12px 18px;border-radius:12px;margin:0 8px 8px 0">${c.label}</a>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.surface};border-radius:16px;overflow:hidden">
        <tr><td style="padding:20px 22px">
          <div style="${font}">
            <img src="${APP_URL}/orbit-logo.png" alt="" width="26" height="26" style="border-radius:6px;vertical-align:middle" />
            <span style="font-size:15px;font-weight:600;color:${C.ink};margin-left:8px;vertical-align:middle">Orbit</span>
          </div>
          <h1 style="margin:16px 0 12px;${font};font-size:20px;line-height:1.3;color:${C.ink}">${opts.heading}</h1>
          ${opts.bodyHtml ? `<div style="${font};font-size:15px;line-height:1.5;color:${C.ink}">${opts.bodyHtml}</div>` : ""}
          ${rowsHtml ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;${font}">${rowsHtml}</table>` : ""}
          <div style="margin-top:14px">${ctas}</div>
          ${opts.note ? `<p style="margin:12px 0 0;${font};font-size:13px;line-height:1.5;color:${C.muted}">${opts.note}</p>` : ""}
        </td></tr>
        <tr><td style="padding:14px 22px;border-top:1px solid ${C.line}">
          <p style="margin:0;${font};font-size:13px;line-height:1.5;color:${C.muted}">
            ${opts.footer ?? `You get this because email alerts are on &mdash; change that in <a href="${APP_URL}/settings/account" style="color:${C.primary};text-decoration:none">Account</a>.`}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Account mail: the set-password invite (unchanged in spirit). */
export function inviteEmail(opts: {
  name: string;
  roleLabel: string;
  inviterName: string;
  url: string;
  projectName?: string;
}): EmailBody {
  const subject = "You've been invited to Orbit";
  const blurb = opts.projectName
    ? `${escapeHtml(opts.inviterName)} has invited you to Orbit and added you to <strong>${escapeHtml(opts.projectName)}</strong>. Set a password to get started.`
    : `${escapeHtml(opts.inviterName)} has invited you to Orbit. Set a password to get started.`;
  const html = layout({
    heading: `${escapeHtml(opts.name)}, welcome to Orbit`,
    bodyHtml: `<p style="margin:0 0 12px">${blurb}</p>`,
    rows: [
      ["Your role", escapeHtml(opts.roleLabel)],
      ...(opts.projectName ? ([["Project", escapeHtml(opts.projectName)]] as [string, string][]) : []),
      ["Invited by", escapeHtml(opts.inviterName)],
    ],
    ctas: [{ label: "Set your password", url: opts.url }],
    note: "This link works for 72 hours.",
    footer: "If you weren&rsquo;t expecting this, you can ignore this email.",
  });
  const text = [
    `Welcome to Orbit, ${opts.name}.`,
    "",
    opts.projectName
      ? `${opts.inviterName} has invited you to Orbit as a ${opts.roleLabel} and added you to ${opts.projectName}.`
      : `${opts.inviterName} has invited you to Orbit as a ${opts.roleLabel}.`,
    "Set a password to get started:",
    opts.url,
    "",
    "This link works for 72 hours.",
  ].join("\n");
  return { subject, html, text };
}

/** (a) task_given */
export function taskGivenEmail(opts: {
  taskTitle: string;
  projectName: string;
  giverName: string;
  dueDate: Date | null;
  url: string;
}): EmailBody {
  const when = opts.dueDate ? formatISTDate(opts.dueDate) : "No date yet";
  const subject = `${opts.giverName} gave you a task: ${opts.taskTitle}`;
  const html = layout({
    heading: escapeHtml(opts.taskTitle),
    bodyHtml: `<p style="margin:0 0 12px">${escapeHtml(opts.giverName)} gave you this in <strong>${escapeHtml(opts.projectName)}</strong>.</p>`,
    rows: [["By when", when]],
    ctas: [{ label: "Open the task", url: opts.url }],
  });
  const text = [subject, "", `Project: ${opts.projectName}`, `By when: ${when}`, "", `Open: ${opts.url}`].join("\n");
  return { subject, html, text };
}

export type TomorrowEmailInput = {
  name: string;
  dayLabel: string;
  dueTomorrow: { title: string; projectName: string; url: string }[];
  overdueCount: number;
  overdueUrl: string;
  meetings: { title: string; projectName: string; time: string; yesUrl: string; noUrl: string }[];
};

/** (b) tomorrow — one per person, the evening before. */
export function tomorrowEmail(o: TomorrowEmailInput): EmailBody {
  const parts: string[] = [];
  if (o.meetings.length) {
    parts.push(
      `<p style="margin:0 0 6px"><strong>Tomorrow you have ${o.meetings.length === 1 ? "a meeting" : `${o.meetings.length} meetings`}</strong></p>` +
        o.meetings
          .map(
            (m) =>
              `<div style="margin:0 0 12px;padding:10px 12px;background:${C.bg};border-radius:12px">` +
              `<div style="font-weight:600">${escapeHtml(m.title)}</div>` +
              `<div style="color:${C.muted};font-size:13px">${escapeHtml(m.projectName)} · ${escapeHtml(m.time)}</div>` +
              `<div style="margin-top:8px"><a href="${m.yesUrl}" style="display:inline-block;background:${C.primary};color:${C.onPrimary};text-decoration:none;font-size:13px;font-weight:600;padding:8px 12px;border-radius:10px;margin-right:6px">I'll be there</a>` +
              `<a href="${m.noUrl}" style="display:inline-block;background:${C.surface};color:${C.danger};text-decoration:none;font-size:13px;font-weight:600;padding:8px 12px;border-radius:10px;border:1px solid ${C.line}">Can't</a></div></div>`,
          )
          .join(""),
    );
  }
  if (o.dueTomorrow.length) {
    parts.push(
      `<p style="margin:12px 0 6px"><strong>Due tomorrow</strong></p><ul style="margin:0 0 12px;padding-left:18px">` +
        o.dueTomorrow.map((t) => `<li><a href="${t.url}" style="color:${C.ink};text-decoration:none">${escapeHtml(t.title)}</a> <span style="color:${C.muted}">· ${escapeHtml(t.projectName)}</span></li>`).join("") +
        `</ul>`,
    );
  }
  if (o.overdueCount > 0) {
    parts.push(
      `<p style="margin:12px 0 0;color:${C.danger}"><a href="${o.overdueUrl}" style="color:${C.danger};text-decoration:none">${o.overdueCount} ${o.overdueCount === 1 ? "task is" : "tasks are"} late</a></p>`,
    );
  }
  const subject =
    o.meetings.length > 0
      ? `Tomorrow: ${o.meetings[0].title}${o.meetings.length > 1 ? ` +${o.meetings.length - 1}` : ""}`
      : o.dueTomorrow.length > 0
        ? `Due tomorrow: ${o.dueTomorrow[0].title}${o.dueTomorrow.length > 1 ? ` +${o.dueTomorrow.length - 1}` : ""}`
        : `${o.overdueCount} ${o.overdueCount === 1 ? "task is" : "tasks are"} late`;
  const html = layout({
    heading: `Hi ${escapeHtml(o.name)} — ${escapeHtml(o.dayLabel)}`,
    bodyHtml: parts.join(""),
    ctas: [{ label: "Open Today", url: `${APP_URL}/`, tone: "quiet" }],
  });
  const text = [
    `Hi ${o.name} — ${o.dayLabel}`,
    ...(o.meetings.length ? ["", "Meetings tomorrow:", ...o.meetings.map((m) => `- ${m.title} · ${m.projectName} · ${m.time}\n  I'll be there: ${m.yesUrl}\n  Can't: ${m.noUrl}`)] : []),
    ...(o.dueTomorrow.length ? ["", "Due tomorrow:", ...o.dueTomorrow.map((t) => `- ${t.title} · ${t.projectName}  ${t.url}`)] : []),
    ...(o.overdueCount ? ["", `${o.overdueCount} ${o.overdueCount === 1 ? "task is" : "tasks are"} late: ${o.overdueUrl}`] : []),
    "",
    `Today: ${APP_URL}/`,
  ].join("\n");
  return { subject, html, text };
}

/** (c) review_result */
export function reviewResultEmail(opts: {
  milestoneName: string;
  projectName: string;
  outcomeLabel: string;
  note: string | null;
  progress: number;
  byName: string;
  url: string;
}): EmailBody {
  const subject = `${opts.projectName} · ${opts.milestoneName}: ${opts.outcomeLabel}`;
  const html = layout({
    heading: `${escapeHtml(opts.milestoneName)} review: ${escapeHtml(opts.outcomeLabel)}`,
    bodyHtml:
      `<p style="margin:0 0 12px">${escapeHtml(opts.byName)} reviewed <strong>${escapeHtml(opts.projectName)}</strong> — <strong>${opts.progress}%</strong> of its tasks are done.</p>` +
      (opts.note ? `<p style="margin:0 0 12px;padding:10px 12px;background:${C.bg};border-radius:12px">${escapeHtml(opts.note)}</p>` : ""),
    ctas: [{ label: "Open the project", url: opts.url }],
  });
  const text = [
    subject,
    "",
    `${opts.byName} reviewed ${opts.projectName} — ${opts.progress}% of its tasks are done.`,
    ...(opts.note ? ["", opts.note] : []),
    "",
    `Open: ${opts.url}`,
  ].join("\n");
  return { subject, html, text };
}
