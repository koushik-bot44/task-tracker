import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import { hashInviteToken } from "@/lib/invite";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { HttpError, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { token: string } };

const acceptSchema = z.object({ password: z.string().min(8).max(200) });

/** Reject the passwords everyone tries first; scrypt does the rest. */
function isTrivial(password: string): boolean {
  const p = password.toLowerCase();
  if (new Set(password).size < 4) return true; // "aaaaaaaa", "12121212"
  return ["password", "12345678", "orbit123", "qwertyui", "11111111"].includes(p);
}

/**
 * Public. Sets the invitee's password, activates the account, single-uses the
 * invite, and signs them in. Re-validates the token server-side — a consumed or
 * expired link is a 410 regardless of what the page thought.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const parsed = await parseBody(req, acceptSchema);
  if (!parsed.ok) return parsed.response;
  if (isTrivial(parsed.data.password)) {
    throw new HttpError(400, "Please choose a less predictable password.");
  }

  const tokenHash = hashInviteToken(params.token);
  const invite = await prisma.invite.findUnique({ where: { tokenHash } });
  if (!invite) throw new HttpError(410, "This invite link is not valid.");
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, "This invite link has expired. Ask your manager to resend it.");
  }

  // Claim the invite atomically so it can be used exactly once, even under a race.
  const claimed = await prisma.invite.updateMany({
    where: { id: invite.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new HttpError(410, "This invite has already been used.");
  }

  const user = await prisma.user.update({
    where: { id: invite.userId },
    data: { passwordHash: await hashPassword(parsed.data.password), status: "ACTIVE" },
  });

  // Sign them straight in, like a fresh login.
  const token = await createSessionToken({ userId: user.id, role: user.role, name: user.name });
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(sessionCookie(token));
  return res;
});
