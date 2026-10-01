import { NextResponse } from "next/server";
import { emailConfigured } from "@/lib/email";
import { issueInvite } from "@/lib/invite";
import { isRateLimited, recordFailure } from "@/lib/login-attempts";
import { HttpError, requireSignedIn, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Email me a reset link" from the profile menu (2026-10-01): a single-use 72h
 * set-password link to the account's own address — the invite machinery, worded
 * as a reset. The current password keeps working until the link is used.
 */
export const POST = route(async () => {
  const user = await requireSignedIn();
  if (!emailConfigured()) {
    throw new HttpError(503, "Email isn't set up on this site yet. Change your password here with your current one instead.");
  }
  // The sign-in throttle bucket, per account: a few links, then a pause.
  const key = `reset-self:${user.id}`;
  if (await isRateLimited(key)) throw new HttpError(429, "Too many reset emails. Try again later.");
  void recordFailure(key);
  const { sent } = await issueInvite({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    inviterName: user.name,
    createdById: user.id,
    purpose: "reset",
  });
  if (!sent) throw new HttpError(502, "Couldn't send the email just now. Try again in a minute.");
  return NextResponse.json({ ok: true, sentTo: user.email });
});
