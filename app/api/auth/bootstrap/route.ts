import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, passcodeMatches, sessionCookie } from "@/lib/auth";
import {
  clearFailures,
  clientIp,
  hashIp,
  isRateLimited,
  recordFailure,
} from "@/lib/login-attempts";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  passcode: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().min(3).max(320),
  password: z.string().min(8).max(200),
});

/**
 * Creates the very first manager, and only ever that. Once a user exists this
 * endpoint is permanently closed — which is why APP_PASSCODE guarding it is
 * enough: the window it protects shuts after one successful use.
 */
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
    console.error("[bootstrap] could not read login attempts:", error);
    return NextResponse.json({ error: "Setup is unavailable right now." }, { status: 500 });
  }

  const existing = await prisma.user.count();
  if (existing > 0) {
    return NextResponse.json(
      { error: "Setup has already been completed." },
      { status: 410 },
    );
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  if (!process.env.APP_PASSCODE || !passcodeMatches(parsed.data.passcode)) {
    await recordFailure(ipHash);
    return NextResponse.json({ error: "That setup passcode is not right." }, { status: 401 });
  }

  const email = parsed.data.email.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email does not look right." }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash: await hashPassword(parsed.data.password),
        role: "MANAGER",
      },
    });
  } catch {
    // Someone else won the race between the count and the insert.
    return NextResponse.json(
      { error: "Setup has already been completed." },
      { status: 410 },
    );
  }

  clearFailures(ipHash);

  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    name: user.name,
  });

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(sessionCookie(token));
  return res;
}

/** Tells the login page which variant to render. */
export async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ needsBootstrap: count === 0 });
}
