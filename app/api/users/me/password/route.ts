import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(8).max(200),
});

/**
 * Changing your own password proves you know the old one first, so a borrowed
 * session cannot lock the real owner out.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  // An ACTIVE user always has a hash; a PENDING invitee has none and cannot
  // reach this signed-in route anyway. Guard the type and fail closed.
  const ok = user.passwordHash
    ? await verifyPassword(parsed.data.current, user.passwordHash)
    : false;
  if (!ok) {
    // 403, NOT 401: the session is valid — it is the supplied CURRENT password
    // that is wrong. A 401 here collides with the client's "session expired"
    // handler, which swallows this message and bounces the user to /login.
    return NextResponse.json(
      { error: "That is not your current password." },
      { status: 403 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next) },
  });

  return NextResponse.json({ ok: true });
});
