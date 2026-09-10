import { createHash, randomBytes } from "node:crypto";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/email";
import { inviteEmail } from "@/lib/email-templates";
import { prisma } from "@/lib/prisma";
import { ROLE_LABEL, type UserRole } from "@/lib/types";

/**
 * Invite tokens (phase 10). The raw token lives only in the link — the emailed
 * one, and the same link handed once to whoever made the invite, so they can
 * send it on WhatsApp or any other way when an email lands in spam (owner,
 * 2026-09-10). The database stores just its sha256, exactly as passwords store
 * only a hash — a leaked table cannot be turned into a working set-password link.
 */

export const INVITE_TTL_HOURS = 72;

const APP_URL = getBaseUrl();

/** A URL-safe token with plenty of entropy. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The only form ever persisted or looked up by. */
export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Expiry `INVITE_TTL_HOURS` from now. */
export function inviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * Create or rotate a user's invite and email the set-password link. Used by both
 * the invite-create path and Resend — one place, so a resend behaves exactly
 * like a fresh invite (new token, fresh 72h, prior link dead). Returns the raw
 * token (for tests), the link (for the person inviting, to pass on by hand) and
 * whether the email actually sent. `send: false` makes the link without the
 * email. Never throws.
 */
export async function issueInvite(opts: {
  user: { id: string; name: string; email: string; role: UserRole };
  inviterName: string;
  createdById: string;
  /** Phase 29: invited straight into a project — the invite email names it, and
      the new user gets no separate "added to project" email. */
  projectName?: string;
  /** false: only make the link, for the person inviting to send themselves (2026-09-10). */
  send?: boolean;
}): Promise<{ token: string; url: string; sent: boolean }> {
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = inviteExpiry();

  await prisma.invite.upsert({
    where: { userId: opts.user.id },
    update: { tokenHash, expiresAt, consumedAt: null, createdById: opts.createdById },
    create: { userId: opts.user.id, tokenHash, expiresAt, createdById: opts.createdById },
  });

  const url = `${APP_URL}/invite/${token}`;
  if (opts.send === false) return { token, url, sent: false };

  const body = inviteEmail({
    name: opts.user.name,
    roleLabel: ROLE_LABEL[opts.user.role],
    inviterName: opts.inviterName,
    url,
    projectName: opts.projectName,
  });
  const res = await sendEmail({
    to: opts.user.email,
    subject: body.subject,
    html: body.html,
    text: body.text,
    // New token each issue, so a resend is not deduped against the prior send.
    dedupeKey: `invite:${opts.user.id}:${tokenHash.slice(0, 16)}`,
    userId: opts.user.id,
    kind: "invite",
    refId: opts.user.id,
  });
  return { token, url, sent: res.sent };
}
