import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";

/**
 * SMTP email (phase 9). Like push, it is fire-and-forget and never throws into
 * a request or cron path: a dead SMTP or missing config is logged and swallowed
 * so it can never 500 an event-create or crash the daily reminder.
 *
 * Dedupe is atomic and reservation-first: the unique dedupeKey row is INSERTED
 * before the send, so two overlapping cron runs cannot both send the same
 * message. If the send then fails, the reservation is released so a later retry
 * can try again.
 */

let transport: Transporter | null = null;
let configured: boolean | null = null;

function ensure(): boolean {
  if (configured !== null) return configured;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    console.warn("[email] SMTP env not set (SMTP_HOST/PORT/USER/PASS, EMAIL_FROM) — email disabled");
    configured = false;
    return false;
  }
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Fail fast instead of hanging a request on a slow/dead relay, and reuse one
    // authenticated connection across a meeting's recipients (a fresh TLS+auth
    // handshake per recipient is what made multi-attendee sends slow).
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  configured = true;
  return true;
}

/** True when the server can send email — endpoints fail loudly on a manual test. */
export function emailConfigured(): boolean {
  return ensure();
}

export type SendResult = { sent: boolean; skipped?: boolean; reason?: string };

/**
 * Domains that can never hold a real mailbox (RFC 2606 / RFC 6762). Seed and rig
 * accounts live at `@orbit.local`, and mailing them wastes the daily Gmail quota
 * and earns bounces that hurt the sender's standing. Refused in EVERY
 * environment — production included, where such an address is a mistake anyway.
 */
const UNREACHABLE = /(^|\.)(local|localhost|test|invalid|example)$/i;

function unreachable(address: string): boolean {
  const domain = address.split("@")[1]?.trim().toLowerCase() ?? "";
  return domain.length === 0 || UNREACHABLE.test(domain);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  dedupeKey: string;
  userId: string;
  kind: string;
  refId: string;
}): Promise<SendResult> {
  if (!ensure()) return { sent: false, reason: "not-configured" };

  // Never hand the relay an address that cannot exist.
  if (unreachable(opts.to)) {
    console.log(`[email] not sending to ${opts.to} — that domain can never receive mail`);
    return { sent: false, skipped: true, reason: "unreachable-domain" };
  }

  // A laptop must never mail the company BY ACCIDENT. In development, mail leaves
  // only for addresses listed in EMAIL_DEV_ALLOW — your own, for testing — or for
  // everyone when it is set to "*" (owner, 2026-09-09: real invites have to
  // reach real people while the app runs from a laptop). The rigs used to mail
  // real people and burned the Gmail daily limit (2026-09-09), so a rig must
  // still address only throwaway inboxes.
  if (process.env.NODE_ENV === "development") {
    const allow = (process.env.EMAIL_DEV_ALLOW ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
    const everyone = allow.includes("*");
    if (!everyone && !allow.includes(opts.to.toLowerCase())) {
      console.log(`[email] dev: not sending to ${opts.to} (add it to EMAIL_DEV_ALLOW, or "*" for everyone)`);
      return { sent: false, skipped: true, reason: "dev-allowlist" };
    }
  }

  // Reserve the dedupeKey first. A unique-constraint failure means this exact
  // message was already sent (or is in flight) — skip.
  try {
    await prisma.emailLog.create({
      data: { userId: opts.userId, kind: opts.kind, refId: opts.refId, dedupeKey: opts.dedupeKey },
    });
  } catch {
    return { sent: false, skipped: true };
  }

  try {
    await transport!.sendMail({
      from: process.env.EMAIL_FROM,
      to: opts.to,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { sent: true };
  } catch (err) {
    // The send failed after reserving — release the key so a retry can resend.
    await prisma.emailLog.delete({ where: { dedupeKey: opts.dedupeKey } }).catch(() => undefined);
    console.error("[email] send failed:", (err as Error).message);
    return { sent: false, reason: "error" };
  }
}
