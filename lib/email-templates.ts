import { getBaseUrl } from "@/lib/base-url";
import { formatISTDate } from "@/lib/timezone";

/**
 * Email bodies — plain text + minimal inline-styled HTML (no external CSS; email
 * clients strip it). Colours mirror the Sunny SaaS light tokens as literal hex
 * because inline email styles cannot reference CSS variables; this is the one
 * intentional place for hex outside the token files.
 */

const APP_URL = getBaseUrl();

const C = {
  bg: "#f2f6fc",
  surface: "#ffffff",
  ink: "#16255b",
  muted: "#5a6b91",
  primary: "#2f68f0",
  onPrimary: "#ffffff",
  line: "#dfe6f2",
};

export type EmailBody = { subject: string; html: string; text: string };

function layout(opts: {
  heading: string;
  rows: [string, string][];
  blurb?: string;
  ctaLabel: string;
  ctaUrl: string;
  /** A small muted line below the button (e.g. link expiry). */
  note?: string;
  /** Overrides the default opt-out footer — invitees have no account yet. */
  footer?: string;
}): string {
  const rowsHtml = opts.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:${C.muted};font-size:13px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0;color:${C.ink};font-size:14px">${v}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.surface};border:1px solid ${C.line};border-radius:16px;overflow:hidden">
        <tr><td style="padding:20px 22px">
          <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
            <img src="${APP_URL}/orbit-logo.png" alt="" width="26" height="26" style="border-radius:6px;vertical-align:middle" />
            <span style="font-size:15px;font-weight:600;color:${C.ink};margin-left:8px;vertical-align:middle">Orbit</span>
          </div>
          <h1 style="margin:16px 0 12px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:19px;line-height:1.3;color:${C.ink}">${opts.heading}</h1>
          ${opts.blurb ? `<p style="margin:0 0 14px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${C.ink}">${opts.blurb}</p>` : ""}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">${rowsHtml}</table>
          <a href="${opts.ctaUrl}" style="display:inline-block;background:${C.primary};color:${C.onPrimary};text-decoration:none;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:11px 18px;border-radius:12px">${opts.ctaLabel}</a>
          ${opts.note ? `<p style="margin:12px 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.muted}">${opts.note}</p>` : ""}
        </td></tr>
        <tr><td style="padding:14px 22px;border-top:1px solid ${C.line}">
          <p style="margin:0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.muted}">
            ${
              opts.footer ??
              `You&rsquo;re receiving this because email alerts are on &mdash; manage in <a href="${APP_URL}/settings/account" style="color:${C.primary};text-decoration:none">Settings</a>.`
            }
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

type EventEmailKind = "event_new" | "event_moved" | "event_cancelled" | "event_updated";

const HEAD: Record<EventEmailKind, (t: string) => string> = {
  event_new: (t) => `New meeting: ${t}`,
  event_moved: (t) => `Meeting moved: ${t}`,
  event_cancelled: (t) => `Meeting cancelled: ${t}`,
  event_updated: (t) => `Meeting updated: ${t}`,
};

export function eventEmail(
  kind: EventEmailKind,
  event: {
    title: string;
    description: string;
    date: Date;
    createdByName: string;
    startTime?: string | null;
    endTime?: string | null;
  },
  projectName: string | null,
): EmailBody {
  const dateStr = formatISTDate(event.date);
  const scope = projectName ?? "All-hands";
  // A meeting carries a time (phase 22); a plain event doesn't.
  const timeStr = event.startTime
    ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
    : null;
  const subject = `${HEAD[kind](event.title)} — ${dateStr}`;
  const rows: [string, string][] = [
    ["When", dateStr],
    ...(timeStr ? ([["Time", timeStr]] as [string, string][]) : []),
    ["For", scope],
    ["Organiser", event.createdByName],
  ];
  const heading =
    kind === "event_cancelled"
      ? `${event.title} was cancelled`
      : kind === "event_moved"
        ? `${event.title} moved to ${dateStr}`
        : kind === "event_updated"
          ? `${event.title} was updated`
          : event.title;
  const html = layout({
    heading,
    blurb: event.description?.trim() ? escapeHtml(event.description) : undefined,
    rows,
    ctaLabel: "Open the calendar",
    ctaUrl: `${APP_URL}/calendar`,
  });
  const text = [
    HEAD[kind](event.title),
    "",
    `When: ${dateStr}`,
    ...(timeStr ? [`Time: ${timeStr}`] : []),
    `For: ${scope}`,
    `Organiser: ${event.createdByName}`,
    event.description?.trim() ? `\n${event.description.trim()}` : "",
    "",
    `Calendar: ${APP_URL}/calendar`,
    "",
    "You're receiving this because email alerts are on — manage in Settings.",
  ].join("\n");
  return { subject, html, text };
}

export function taskDueEmail(task: { title: string; status: string }, toolName: string, slug: string, taskId: string): EmailBody {
  const url = `${APP_URL}/t/${slug}?task=${taskId}`;
  const subject = `Task due today: ${task.title}`;
  const html = layout({
    heading: `Due today: ${escapeHtml(task.title)}`,
    rows: [
      ["Tool", escapeHtml(toolName)],
      ["Status", statusLabel(task.status)],
    ],
    ctaLabel: "Open the task",
    ctaUrl: url,
  });
  const text = [
    `Task due today: ${task.title}`,
    "",
    `Tool: ${toolName}`,
    `Status: ${statusLabel(task.status)}`,
    "",
    `Open: ${url}`,
    "",
    "You're receiving this because email alerts are on — manage in Settings.",
  ].join("\n");
  return { subject, html, text };
}

export function testEmail(): EmailBody {
  const subject = "Test email from Orbit";
  const html = layout({
    heading: "Email is working",
    blurb: "This is a test from Orbit. Meeting and task-due alerts will arrive here.",
    rows: [],
    ctaLabel: "Open Orbit",
    ctaUrl: APP_URL,
  });
  const text = `Test email from Orbit\n\nEmail is working. Meeting and task-due alerts will arrive here.\n\n${APP_URL}\n\nYou're receiving this because email alerts are on — manage in Settings.`;
  return { subject, html, text };
}

export function inviteEmail(opts: {
  name: string;
  roleLabel: string;
  inviterName: string;
  url: string;
  /** Phase 29: when invited straight into a project (from the New Project modal),
      the ONE invite email also names that project — the new user gets no separate
      "added to project" email. */
  projectName?: string;
}): EmailBody {
  const subject = "You've been invited to Orbit";
  const blurb = opts.projectName
    ? `${escapeHtml(opts.inviterName)} has invited you to Orbit and added you to <strong>${escapeHtml(opts.projectName)}</strong>. Set a password to activate your account and sign in.`
    : `${escapeHtml(opts.inviterName)} has invited you to Orbit. Set a password to activate your account and sign in.`;
  const html = layout({
    heading: `${escapeHtml(opts.name)}, welcome to Orbit`,
    blurb,
    rows: [
      ["Your role", escapeHtml(opts.roleLabel)],
      ...(opts.projectName ? ([["Project", escapeHtml(opts.projectName)]] as [string, string][]) : []),
      ["Invited by", escapeHtml(opts.inviterName)],
    ],
    ctaLabel: "Set your password",
    ctaUrl: opts.url,
    note: "This invite link expires in 72 hours.",
    footer: "If you weren&rsquo;t expecting this invitation, you can safely ignore this email.",
  });
  const text = [
    `Welcome to Orbit, ${opts.name}.`,
    "",
    opts.projectName
      ? `${opts.inviterName} has invited you to Orbit as a ${opts.roleLabel} and added you to ${opts.projectName}.`
      : `${opts.inviterName} has invited you to Orbit as a ${opts.roleLabel}.`,
    "Set a password to activate your account and sign in:",
    opts.url,
    "",
    "This invite link expires in 72 hours.",
    "If you weren't expecting this invitation, you can safely ignore this email.",
  ].join("\n");
  return { subject, html, text };
}

/**
 * Phase 29 — "you've been added to a project" (an EXISTING user added as a
 * developer member, or assigned as the team lead). A brand-new invited user is
 * NOT sent this (their invite email already names the project).
 */
export function projectAddedEmail(opts: {
  projectName: string;
  roleLabel: string; // "Developer" | "Team lead"
  addedByName: string;
  url: string;
}): EmailBody {
  const subject = `You've been added to ${opts.projectName}`;
  const html = layout({
    heading: `You've been added to ${escapeHtml(opts.projectName)}`,
    blurb: `${escapeHtml(opts.addedByName)} added you to <strong>${escapeHtml(opts.projectName)}</strong> as ${escapeHtml(opts.roleLabel.toLowerCase())}.`,
    rows: [
      ["Project", escapeHtml(opts.projectName)],
      ["Your role", escapeHtml(opts.roleLabel)],
      ["Added by", escapeHtml(opts.addedByName)],
    ],
    ctaLabel: "Open the project",
    ctaUrl: opts.url,
  });
  const text = [
    `You've been added to ${opts.projectName}.`,
    "",
    `${opts.addedByName} added you as ${opts.roleLabel.toLowerCase()}.`,
    "",
    `Open: ${opts.url}`,
    "",
    "You're receiving this because email alerts are on — manage in Settings.",
  ].join("\n");
  return { subject, html, text };
}

export function collabInviteEmail(opts: {
  inviteeName: string;
  inviterName: string;
  projectName: string;
  url: string;
}): EmailBody {
  const subject = `${opts.inviterName} invited you to collaborate on ${opts.projectName}`;
  const html = layout({
    heading: `${escapeHtml(opts.inviterName)} invited you to collaborate`,
    blurb: `You've been invited to collaborate on <strong>${escapeHtml(opts.projectName)}</strong>. Open the invitation to accept or decline — you can also do it from your Home in Orbit.`,
    rows: [
      ["Project", escapeHtml(opts.projectName)],
      ["Invited by", escapeHtml(opts.inviterName)],
    ],
    ctaLabel: "Accept or decline",
    ctaUrl: opts.url,
    note: "This link responds to this one invitation. Once you (or the inviter) act on it — here or in the app — it stops working.",
    footer: "If you weren&rsquo;t expecting this invitation, you can safely ignore this email.",
  });
  const text = [
    `${opts.inviterName} invited you to collaborate on ${opts.projectName}.`,
    "",
    "Open the invitation to accept or decline (you can also do this from your Home in Orbit):",
    opts.url,
    "",
    "Once you or the inviter act on it — here or in the app — this link stops working.",
    "If you weren't expecting this invitation, you can safely ignore this email.",
  ].join("\n");
  return { subject, html, text };
}

function statusLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
