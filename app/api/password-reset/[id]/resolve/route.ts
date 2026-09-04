import { NextResponse } from "next/server";
import { issueInvite } from "@/lib/invite";
import { prisma } from "@/lib/prisma";
import { HttpError, requireAdmin, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Admin resolves a reset request (phase 14). It issues a single-use, 72h
 * set-password link (the SAME machinery as an invite) and emails it — the
 * user's CURRENT password is left intact, so they are never locked out; it only
 * changes once they use the link. The admin never sees or types a password.
 */
export const POST = route(async (_req: Request, { params }: Params) => {
  const admin = await requireAdmin();

  const request = await prisma.passwordResetRequest.findUnique({
    where: { id: params.id },
    include: { user: { select: { id: true, name: true, email: true, role: true, disabledAt: true } } },
  });
  if (!request) throw new HttpError(404, "Request not found");
  if (request.status !== "PENDING") {
    throw new HttpError(409, "This request has already been handled.");
  }
  if (request.user.disabledAt) {
    throw new HttpError(409, "That account is disabled.");
  }

  const { sent } = await issueInvite({
    user: request.user,
    inviterName: admin.name,
    createdById: admin.id,
  });

  await prisma.passwordResetRequest.update({
    where: { id: params.id },
    data: { status: "RESOLVED", resolvedById: admin.id, resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true, emailSent: sent });
});
