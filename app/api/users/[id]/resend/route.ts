import { NextResponse } from "next/server";
import { issueInvite } from "@/lib/invite";
import { assertCanAdministerTarget } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const RESEND_WINDOW_MS = 60_000;
const RESEND_MAX = 3;

/**
 * Resend a pending user's invite: rotate the token (the old link dies) with a
 * fresh 72h expiry and email it again. `{ email: false }` makes the new link
 * without the email, for the person inviting to send on WhatsApp or any other
 * way (owner, 2026-09-10); either way the link comes back. Same scope as
 * managing the account — a manager or admin, and never the admin account (which
 * is never pending anyway). Emails are rate-limited via the sent-email ledger so
 * nobody can hammer an inbox.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const actor = await requireUser();
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = body?.email !== false;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new HttpError(404, "User not found");

  // Account admins only; only an admin could touch an admin account (n/a here).
  await assertCanAdministerTarget(actor, target);

  if (target.status !== "PENDING") {
    throw new HttpError(409, "This account is already active.");
  }

  if (email) {
    const recent = await prisma.emailLog.count({
      where: { userId: target.id, kind: "invite", sentAt: { gte: new Date(Date.now() - RESEND_WINDOW_MS) } },
    });
    if (recent >= RESEND_MAX) {
      throw new HttpError(429, "Too many resends. Wait a minute and try again.");
    }
  }

  const { sent, url } = await issueInvite({
    user: { id: target.id, name: target.name, email: target.email, role: target.role },
    inviterName: actor.name,
    createdById: actor.id,
    send: email,
  });

  return NextResponse.json({ ok: true, emailSent: sent, inviteUrl: url });
});
