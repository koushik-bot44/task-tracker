import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readSchema = z
  .object({ id: z.string().min(1).optional(), all: z.literal(true).optional() })
  .refine((v) => Boolean(v.id) || v.all === true, { message: "id or all is required" });

/** Mark notifications read. Strictly caller-scoped: marking one you do not own
    is a 404 (a user cannot touch another user's notifications). */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, readSchema);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.all) {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  const id = parsed.data.id as string;
  const owned = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
  if (!owned || owned.userId !== user.id) {
    throw new HttpError(404, "Notification not found");
  }
  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
});
