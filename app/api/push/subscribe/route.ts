import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The shape a browser's PushSubscription.toJSON() produces. */
const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  userAgent: z.string().max(500).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

/** Save (or move to this user) a browser's push subscription. Idempotent on endpoint. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, subscribeSchema);
  if (!parsed.ok) return parsed.response;
  const { endpoint, keys, userAgent } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? null,
    },
  });

  return NextResponse.json({ ok: true });
});

/** Remove this user's subscription for a given endpoint (unsubscribe). */
export const DELETE = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = await parseBody(req, unsubscribeSchema);
  if (!parsed.ok) return parsed.response;

  // Scoped to the caller so nobody can delete another user's subscription.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: user.id },
  });

  return NextResponse.json({ ok: true });
});
