import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { HttpError, route } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function urlOf(data: unknown): string {
  return data && typeof data === "object" && "url" in data
    ? String((data as { url?: unknown }).url ?? "/")
    : "/";
}

/**
 * Snooze wake (phase 23). Vercel Cron hits this on a short interval (see
 * vercel.json). NOT publicly triggerable: it demands the CRON_SECRET Vercel
 * sends as `Authorization: Bearer <secret>` and 401s anything else — identical
 * to the task-due job.
 *
 * It wakes every notification whose snooze time has passed: it re-activates the
 * item (clears snoozedUntil AND readAt, so it returns to the bell as UNREAD)
 * and re-fires the phone PUSH so the device buzzes again.
 *
 * IDEMPOTENCY / no double-push: each item is CLAIMED with a conditional
 * updateMany (id + snoozedUntil <= now) BEFORE it is pushed. Waking sets
 * snoozedUntil = null, so a later tick (or a concurrent run) matches zero rows
 * for that id and never pushes it twice. No separate "rewoken" flag is needed.
 *
 * PRECISION LIMITATION: wake happens on the NEXT cron tick after the chosen
 * time, not the exact minute — snooze is "around then". See the report.
 */
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    throw new HttpError(401, "Unauthorized");
  }

  const now = new Date();
  const due = await prisma.notification.findMany({
    where: { snoozedUntil: { lte: now } },
    select: { id: true, userId: true, title: true, body: true, data: true },
  });

  let woken = 0;
  let pushed = 0;
  for (const n of due) {
    // Claim atomically — only the run that flips snoozedUntil from a past value
    // to null gets count 1, and only it pushes. Also reset readAt so the item is
    // unread again in the bell.
    const claim = await prisma.notification.updateMany({
      where: { id: n.id, snoozedUntil: { lte: now } },
      data: { snoozedUntil: null, readAt: null },
    });
    if (claim.count !== 1) continue;
    woken++;
    const res = await sendPushToUsers([n.userId], {
      title: n.title,
      body: n.body,
      url: urlOf(n.data),
      tag: `notif-${n.id}`,
    });
    pushed += res.sent;
  }

  return NextResponse.json({ ok: true, scanned: due.length, woken, pushed });
});
