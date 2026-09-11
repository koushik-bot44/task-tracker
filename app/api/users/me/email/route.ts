import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { isEmailShaped, normalizeEmail, takenEmails } from "@/lib/user-emails";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(200),
});

/**
 * Your own sign-in address (2026-09-11). Nobody above the CEO can change the
 * CEO's, so the account moves to its real address from here. Like a password
 * change it proves the current password first, so a borrowed session cannot
 * take the account; the address must be nobody else's, main or extra. Sessions
 * stay open: they belong to the account, not the address.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const ok = user.passwordHash ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  // 403, not 401: the session is fine, the password given is not (see users/me/password).
  if (!ok) return NextResponse.json({ error: "That is not your current password." }, { status: 403 });

  const next = normalizeEmail(parsed.data.email);
  if (!isEmailShaped(next)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  if (next === user.email) return NextResponse.json({ ok: true, email: next });
  if ((await takenEmails([next], user.id)).length > 0) {
    return NextResponse.json({ error: "That email already belongs to someone else." }, { status: 409 });
  }

  // One of your extra addresses becoming the main one is not kept twice.
  await prisma.userEmail.deleteMany({ where: { userId: user.id, email: next } });
  await prisma.user.update({ where: { id: user.id }, data: { email: next } });
  return NextResponse.json({ ok: true, email: next });
});
