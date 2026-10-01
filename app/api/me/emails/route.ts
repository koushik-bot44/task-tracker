import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { addOtherEmails, isEmailShaped, normalizeEmail, takenEmails } from "@/lib/user-emails";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Other sign-in addresses on the CEO's own account (owner, 2026-10-01: a dev
 * login that is the CEO account itself). Each opens the same account with the
 * same password. CEO only: an extra address claims that address for this
 * account, so anyone else adding one could swallow another person's invite.
 */
async function requireCeo() {
  const user = await requireUser();
  if (user.role !== "FOUNDER") throw new HttpError(403, "Only the CEO can add sign-in addresses.");
  return user;
}

async function list(userId: string) {
  const rows = await prisma.userEmail.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { email: true } });
  return rows.map((r) => r.email);
}

export const GET = route(async () => {
  const user = await requireCeo();
  return NextResponse.json({ main: user.email, others: await list(user.id) });
});

const addSchema = z.object({ email: z.string().trim().min(3).max(320), password: z.string().min(1).max(200) });

export const POST = route(async (req: Request) => {
  const user = await requireCeo();
  const parsed = await parseBody(req, addSchema);
  if (!parsed.ok) return parsed.response;
  // As for changing the sign-in email: prove it's you, so a borrowed session can't add one.
  const ok = user.passwordHash ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!ok) throw new HttpError(403, "That is not your current password.");
  const email = normalizeEmail(parsed.data.email);
  if (!isEmailShaped(email)) throw new HttpError(400, "That doesn't look like an email address.");
  if (email === user.email) throw new HttpError(409, "That is already your main address.");
  if ((await takenEmails([email], user.id)).length) throw new HttpError(409, "That address already signs in to another account.");
  await addOtherEmails(user.id, [email]);
  return NextResponse.json({ main: user.email, others: await list(user.id) });
});

export const DELETE = route(async (req: Request) => {
  const user = await requireCeo();
  const email = normalizeEmail(new URL(req.url).searchParams.get("email") ?? "");
  await prisma.userEmail.deleteMany({ where: { userId: user.id, email } });
  return NextResponse.json({ main: user.email, others: await list(user.id) });
});
