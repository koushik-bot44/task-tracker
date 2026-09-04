import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import {
  clearFailures,
  clientIp,
  hashIp,
  isRateLimited,
  recordFailure,
} from "@/lib/login-attempts";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
});

/**
 * Misconfiguration is an operator problem, not a visitor's. The response says
 * only that sign-in failed; the reason goes to the server log.
 */
const GENERIC_FAILURE = "Sign-in is unavailable right now.";

/** Wrong email and wrong password are indistinguishable from outside. */
const BAD_CREDENTIALS = "That email and password do not match.";

export async function POST(req: Request) {
  const ipHash = hashIp(clientIp(req));

  try {
    if (await isRateLimited(ipHash)) {
      return NextResponse.json(
        { error: "Too many attempts. Wait a minute." },
        { status: 429 },
      );
    }
  } catch (error) {
    console.error("[auth] could not read login attempts:", error);
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 500 });
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // A disabled or still-PENDING account (no password set) behaves exactly like a
  // wrong password — no signal that the address is real or that an invite is out.
  const okPassword =
    user && !user.disabledAt && user.passwordHash
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : false;

  if (!user || user.disabledAt || !okPassword) {
    await recordFailure(ipHash);
    return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionToken({
      userId: user.id,
      role: user.role,
      name: user.name,
    });
  } catch (error) {
    console.error("[auth] could not mint a session token:", error);
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 500 });
  }

  clearFailures(ipHash);

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(sessionCookie(token));
  return res;
}

/** Sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...sessionCookie(""), maxAge: 0 });
  return res;
}
