import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/invite";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { token: string } };

/**
 * Public (the invitee isn't logged in). Looks the invite up by the token's hash
 * and reports a distinct state so the page can say something useful. Details
 * (name/email/role) are only returned for a valid token — which only the person
 * holding the emailed link can produce.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const tokenHash = hashInviteToken(params.token);
  const invite = await prisma.invite.findUnique({
    where: { tokenHash },
    include: { user: { select: { name: true, email: true, role: true } } },
  });

  if (!invite) return NextResponse.json({ state: "unknown" }, { status: 404 });
  if (invite.consumedAt) return NextResponse.json({ state: "consumed" }, { status: 410 });
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ state: "expired" }, { status: 410 });
  }

  return NextResponse.json({
    state: "valid",
    name: invite.user.name,
    email: invite.user.email,
    role: invite.user.role,
  });
});
