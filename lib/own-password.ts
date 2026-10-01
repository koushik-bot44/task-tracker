import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { z } from "zod";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const ownPasswordSchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(8).max(200),
});

/**
 * Changing your own password proves you know the old one first, so a borrowed
 * session cannot lock the real owner out. Shared by /api/users/me/password (the
 * Account page) and /api/me/password (the profile menu, every account incl. the
 * walled family logins) since 2026-10-01.
 */
export async function changeOwnPassword(user: User, current: string, next: string): Promise<NextResponse> {
  // An ACTIVE user always has a hash; a PENDING invitee has none and cannot
  // reach a signed-in route anyway. Guard the type and fail closed.
  const ok = user.passwordHash ? await verifyPassword(current, user.passwordHash) : false;
  if (!ok) {
    // 403, NOT 401: the session is valid — it is the supplied CURRENT password
    // that is wrong. A 401 here collides with the client's "session expired"
    // handler, which swallows this message and bounces the user to /login.
    return NextResponse.json({ error: "That is not your current password." }, { status: 403 });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    // Every other session the old password opened ends; this one gets a fresh cookie.
    data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } },
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(await createSessionToken({ userId: updated.id, role: updated.role, name: updated.name, version: updated.sessionVersion })));
  return res;
}
