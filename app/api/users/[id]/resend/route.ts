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
 * fresh 72h expiry and email it again. Same scope as managing the account — a
 * manager or admin, and never the admin account (which is never pending anyway).
 * Rate-limited via the sent-email ledger so nobody can hammer an inbox.
 */
export const POST = route(async (_req: Request, { params }: Params) => {
  const actor = await requireUser();

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new HttpError(404, "User not found");

  // Account admins only; only an admin could touch an admin account (n/a here).
  assertCanAdministerTarget(actor, target);

  if (target.status !== "PENDING") {
    throw new HttpError(409, "This account is already active.");
  }

  const recent = await prisma.emailLog.count({
    where: { userId: target.id, kind: "invite", sentAt: { gte: new Date(Date.now() - RESEND_WINDOW_MS) } },
  });
  if (recent >= RESEND_MAX) {
    throw new HttpError(429, "Too many resends. Wait a minute and try again.");
  }

  const { sent } = await issueInvite({
    user: { id: target.id, name: target.name, email: target.email, role: target.role },
    inviterName: actor.name,
    createdById: actor.id,
  });

  return NextResponse.json({ ok: true, emailSent: sent });
});
