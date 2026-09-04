import { prisma } from "@/lib/prisma";

/**
 * WhatsApp via Twilio (phase 32). A direct REST call to Twilio's Messages API
 * with Basic auth (AccountSID:AuthToken) — no SDK dependency, keeping deps
 * minimal. Like push and email, this is fire-and-forget and NEVER throws into a
 * request or cron path: missing config, a dead recipient, or a Twilio error is
 * logged and swallowed so a notification failing can't fail the action.
 *
 * CONFIG GUARD: if any of TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_WHATSAPP_FROM is unset, every send NO-OPs gracefully (logged once,
 * like the VAPID/SMTP-unset patterns) — never an error, never a block.
 *
 * SANDBOX: the Twilio WhatsApp sandbox only delivers to numbers that have JOINED
 * it (sent the join code to the sandbox number). A send to a non-joined number
 * comes back as Twilio error 63015/63016/63007/63018 — caught and logged as
 * "recipient hasn't joined the WhatsApp sandbox", NOT a crash. On the production
 * sender any valid number works, but freeform is replaced by an approved
 * template (see the FREEFORM -> TEMPLATE SEAM below).
 *
 * DEDUPE is reservation-first (mirrors EmailLog): the unique WhatsAppLog row is
 * INSERTED before the send, so two overlapping sends can't both deliver; if the
 * send then fails the reservation is released so a later retry can try again
 * (e.g. after the recipient finally joins the sandbox).
 */

type TwilioConfig = { sid: string; token: string; from: string; contentSid?: string };
let configured: boolean | null = null;
let cfg: TwilioConfig | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  // Trim: a stray newline/space in an env value is a classic cause of auth (20003)
  // and channel failures.
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  let from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!sid || !token || !from) {
    console.warn(
      "[whatsapp] TWILIO env not set (TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM) — WhatsApp disabled",
    );
    configured = false;
    return false;
  }
  // The From must be a WhatsApp-CHANNEL address ("whatsapp:+…"). A value stored as
  // a bare number sends on the SMS channel, and Twilio rejects it against a
  // whatsapp: recipient as a channel mismatch (error 21654). Tolerate the missing
  // prefix rather than fail the send.
  if (!from.startsWith("whatsapp:")) from = `whatsapp:${from}`;
  // Optional approved template (phase 32). When set, sends go out as a Content
  // template (ContentSid + ContentVariables) instead of freeform Body — required
  // by the Twilio trial sender and by any production WhatsApp business number for
  // business-initiated messages. Freeform stays the fallback when it's unset.
  const contentSid = process.env.TWILIO_CONTENT_SID?.trim() || undefined;
  cfg = { sid, token, from, contentSid };
  configured = true;
  return true;
}

/** True when the server can send WhatsApp — endpoints fail loudly on a manual test. */
export function whatsAppConfigured(): boolean {
  return ensureConfigured();
}

/** The exact From address the server will send on (after trim + whatsapp: prefix),
    or null when unconfigured. For the manager-only diagnostic endpoint — it is the
    Twilio sandbox sender, not a secret. */
export function whatsAppFrom(): string | null {
  return ensureConfigured() ? cfg?.from ?? null : null;
}

/** The approved template id sends go out as, or null for freeform. Diagnostic. */
export function whatsAppContentSid(): string | null {
  return ensureConfigured() ? cfg?.contentSid ?? null : null;
}

export type WhatsAppReason =
  | "not-configured"
  | "no-phone"
  | "opted-out"
  | "duplicate"
  | "not-joined"
  | "error";

/** Twilio's To value; the phone must already be E.164 (leading +). */
function toWhatsApp(phone: string): string {
  return `whatsapp:${phone}`;
}

/**
 * FREEFORM -> TEMPLATE SEAM (the one place the wire format changes). When
 * TWILIO_CONTENT_SID is set (the Twilio trial sender and production WhatsApp both
 * require an approved template for business-initiated messages), a send goes out
 * as ContentSid + ContentVariables — the numbered {{1}},{{2}},… slots filled from
 * `vars`. Otherwise it's a freeform Body. Callers always pass the human-readable
 * `message` (the freeform fallback) plus `vars` for the template.
 */
function buildMessageParams(
  c: TwilioConfig,
  to: string,
  message: string,
  vars?: Record<string, string>,
): URLSearchParams {
  const params = new URLSearchParams({ From: c.from, To: to });
  if (c.contentSid) {
    params.set("ContentSid", c.contentSid);
    if (vars && Object.keys(vars).length > 0) params.set("ContentVariables", JSON.stringify(vars));
  } else {
    params.set("Body", message);
  }
  return params;
}

/** POST to Twilio. Base is overridable via TWILIO_API_BASE for testing only. */
async function twilioSend(
  c: TwilioConfig,
  to: string,
  message: string,
  vars?: Record<string, string>,
): Promise<{ ok: boolean; reason?: WhatsAppReason; code?: number; detail?: string }> {
  const base = process.env.TWILIO_API_BASE || "https://api.twilio.com";
  const url = `${base}/2010-04-01/Accounts/${c.sid}/Messages.json`;
  const auth = Buffer.from(`${c.sid}:${c.token}`).toString("base64");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildMessageParams(c, to, message, vars).toString(),
    });
    if (res.ok) return { ok: true };
    let code: number | undefined;
    let detail = "";
    try {
      const j = (await res.json()) as { code?: number; message?: string };
      code = j.code;
      detail = j.message ?? "";
    } catch {
      /* non-JSON error body */
    }
    // Recipient hasn't joined / freeform window — a recipient-side sandbox state,
    // not a config error (63007 = bad From channel, 63018 = rate limit are NOT
    // here; they surface as a generic error with their code so they're diagnosable).
    if (code !== undefined && [63015, 63016].includes(code)) {
      console.warn(`[whatsapp] recipient hasn't joined the WhatsApp sandbox (Twilio ${code}): ${to}`);
      return { ok: false, reason: "not-joined", code, detail };
    }
    console.error(`[whatsapp] Twilio send failed (HTTP ${res.status}, code ${code ?? "?"}): ${detail}`);
    return { ok: false, reason: "error", code, detail };
  } catch (err) {
    console.error("[whatsapp] send error:", (err as Error).message);
    return { ok: false, reason: "error", detail: (err as Error).message };
  }
}

/** Reserve-then-send one message to a known phone. Releases the reservation on failure. */
async function sendOne(
  userId: string,
  phone: string,
  message: string,
  opts: { kind: string; refId: string; keyExtra?: string; vars?: Record<string, string> },
): Promise<{ sent: boolean; reason?: WhatsAppReason; code?: number; detail?: string }> {
  const dedupeKey = `${opts.kind}:${opts.refId}:${userId}${opts.keyExtra ? `:${opts.keyExtra}` : ""}`;
  try {
    await prisma.whatsAppLog.create({
      data: { userId, kind: opts.kind, refId: opts.refId, dedupeKey },
    });
  } catch {
    return { sent: false, reason: "duplicate" };
  }
  const r = await twilioSend(cfg!, toWhatsApp(phone), message, opts.vars);
  if (!r.ok) {
    await prisma.whatsAppLog.delete({ where: { dedupeKey } }).catch(() => undefined);
    return { sent: false, reason: r.reason, code: r.code, detail: r.detail };
  }
  return { sent: true };
}

/**
 * Send to ONE user by id — used by the manager test endpoint. Filters on phone
 * present + whatsappOptIn + active, and returns a reason so the caller can show a
 * clear message ("no-phone", "opted-out", "not-joined", "not-configured").
 */
export async function sendWhatsAppToUser(
  userId: string,
  message: string,
  opts: { kind: string; refId: string; keyExtra?: string; vars?: Record<string, string> },
): Promise<{ sent: boolean; reason?: WhatsAppReason; code?: number; detail?: string }> {
  if (!ensureConfigured()) return { sent: false, reason: "not-configured" };
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { phone: true, whatsappOptIn: true, disabledAt: true } })
    .catch(() => null);
  if (!user || user.disabledAt || !user.phone) return { sent: false, reason: "no-phone" };
  if (!user.whatsappOptIn) return { sent: false, reason: "opted-out" };
  return sendOne(userId, user.phone, message, opts);
}

/**
 * Send `message` to each of `userIds` who has a phone AND whatsappOptIn — the
 * meeting channel. The recipient set is the caller's (never recomputed); this
 * only narrows it to WhatsApp-reachable people. Deduped per (kind, refId, user
 * [, keyExtra]). Always resolves (fire-and-forget-safe). Returns counts.
 */
export async function sendWhatsAppToUsers(
  userIds: string[],
  message: string,
  opts: { kind: string; refId: string; keyExtra?: string; vars?: Record<string, string> },
): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 };
  if (!ensureConfigured() || userIds.length === 0) return result;
  const users = await prisma.user
    .findMany({
      where: { id: { in: [...new Set(userIds)] }, disabledAt: null, phone: { not: null }, whatsappOptIn: true },
      select: { id: true, phone: true },
    })
    .catch(() => []);
  for (const u of users) {
    const r = await sendOne(u.id, u.phone!, message, opts);
    if (r.sent) result.sent++;
    else if (r.reason === "duplicate") result.skipped++;
    else result.failed++;
  }
  return result;
}
