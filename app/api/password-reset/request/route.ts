import { NextResponse } from "next/server";
import { z } from "zod";
import { emailConfigured } from "@/lib/email";
import { issueInvite } from "@/lib/invite";
import { prisma } from "@/lib/prisma";
import { findUserIdByEmail } from "@/lib/user-emails";
import { clientIp, hashIp, isRateLimited, recordFailure } from "@/lib/login-attempts";
import { notifyUsers } from "@/lib/notify";
import { route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().min(3).max(320) });

// Always the same answer, whether or not the email exists — no account
// enumeration through this door.
const GENERIC = { ok: true, message: "If that account exists, an admin has been notified." };
// With email set up (2026-10-01) the link goes straight to the account's own inbox.
const GENERIC_EMAIL = { ok: true, message: "If that account exists, a reset link is on its way to its email." };

/**
 * Public forgot-password (phase 14). If the email matches an ACTIVE account it
 * files ONE pending reset request (deduped) and notifies every admin. It never
 * reveals whether the email exists, and it is rate-limited per IP (reusing the
 * sign-in throttle bucket, namespaced) so it can't be turned into a way to spam
 * admins or probe the user table.
 */
export const POST = route(async (req: Request) => {
  const ipHash = `reset:${hashIp(clientIp(req))}`;
  if (await isRateLimited(ipHash)) {
    return NextResponse.json(emailConfigured() ? GENERIC_EMAIL : GENERIC);
  }
  void recordFailure(ipHash);

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return NextResponse.json(emailConfigured() ? GENERIC_EMAIL : GENERIC); // don't even leak validation shape

  // Any address of theirs opens the same door, so a person who forgets which
  // one they signed up with is not stuck.
  const userId = await findUserIdByEmail(parsed.data.email);
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, disabledAt: true, status: true },
      })
    : null;

  if (emailConfigured()) {
    // Self-service (owner, 2026-10-01): a single-use 72h set-password link to the
    // account's MAIN address — whichever of its addresses was typed — worded as a
    // reset. The current password keeps working until the link is used.
    if (user && !user.disabledAt && user.status === "ACTIVE") {
      await issueInvite({ user, inviterName: user.name, createdById: user.id, purpose: "reset" }).catch((e) => console.error("[reset] link email failed:", e));
    }
    return NextResponse.json(GENERIC_EMAIL);
  }
  if (user && !user.disabledAt && user.status === "ACTIVE") {
    // No email on this site: the old way. One pending request per user — repeats don't stack or re-notify.
    const existing = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: "PENDING" },
      select: { id: true },
    });
    if (!existing) {
      await prisma.passwordResetRequest.create({ data: { userId: user.id } });
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN", disabledAt: null, status: "ACTIVE" },
        select: { id: true },
      });
      await notifyUsers(
        admins.map((a) => a.id),
        {
          type: "reset.requested",
          title: "Password reset requested",
          body: `${user.name} asked to reset their password`,
          url: "/",
          tag: `reset-${user.id}`,
        },
      );
    }
  }

  return NextResponse.json(GENERIC);
});
