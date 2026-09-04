import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
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
    return NextResponse.json(GENERIC);
  }
  void recordFailure(ipHash);

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return NextResponse.json(GENERIC); // don't even leak validation shape

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, disabledAt: true, status: true },
  });

  if (user && !user.disabledAt && user.status === "ACTIVE") {
    // One pending request per user — repeats don't stack or re-notify.
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
