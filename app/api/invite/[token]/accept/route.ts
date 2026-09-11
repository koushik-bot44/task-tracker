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
  // A dead link says which kind of dead, so the page never claims an account is
  // set up when its link was only replaced (2026-09-11).
  const gone = (state: "unknown" | "expired" | "consumed", error: string) => NextResponse.json({ error, state }, { status: 410 });
  if (!invite) return gone("unknown", "This invite link is not valid. A newer link may have replaced it.");
  if (invite.expiresAt.getTime() < Date.now()) return gone("expired", "This invite link has expired. Ask whoever invited you for a fresh one.");
  const account = await prisma.user.findUnique({ where: { id: invite.userId }, select: { disabledAt: true } });
  if (!account || account.disabledAt) return gone("unknown", "This account has been switched off. Ask whoever invited you.");

  // Claim the invite atomically so it can be used exactly once, even under a race.
  const claimed = await prisma.invite.updateMany({
    where: { id: invite.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) return gone("consumed", "This invite has already been used.");

  const user = await prisma.user.update({
    where: { id: invite.userId },
    // A new password ends every session the account already had: an admin's reset
    // link comes through here too (2026-09-11).
    data: { passwordHash: await hashPassword(parsed.data.password), status: "ACTIVE", sessionVersion: { increment: 1 } },
  });

  // Sign them straight in, like a fresh login.
  const token = await createSessionToken({ userId: user.id, role: user.role, name: user.name, version: user.sessionVersion });
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(sessionCookie(token));
  return res;
});
