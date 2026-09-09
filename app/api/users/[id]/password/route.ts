import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/password";
import { assertCanAdministerTarget } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { HttpError, requireAccountAdmin, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const bodySchema = z.object({ password: z.string().min(6, "At least 6 characters").max(200) });

/**
 * Set a person's password by hand (owner, 2026-09-08): a manager or above
 * types it and hands it over personally — for a stuck invite, or someone who
 * forgot theirs. Activates a pending account and kills the old invite link.
 * Nobody sets the CEO's password but the CEO.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const actor = await requireAccountAdmin();
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  await assertCanAdministerTarget(actor, target);
  if (target.role === "FOUNDER" && actor.id !== target.id) {
    throw new HttpError(403, "Only the CEO can change the CEO's password.");
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { passwordHash, status: "ACTIVE", sessionVersion: { increment: 1 } } }),
    prisma.invite.deleteMany({ where: { userId: target.id } }),
  ]);
  return NextResponse.json({ ok: true });
});
