import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// `until` is a full ISO instant (the client sends new Date(local).toISOString());
// null unsnoozes. A non-null value must be in the future (validated below, 400).
const snoozeSchema = z.object({ until: z.string().datetime().nullable() });

/**
 * Snooze (or unsnooze) one of the CALLER'S notifications (phase 23). Strictly
 * caller-scoped exactly like mark-read: touching a notification you do not own
 * is a 404 — checked before the time is even considered, so another user's item
 * never reveals anything. A snooze must be in the future (past -> 400). Snoozing
 * hides the item from the active bell + unread count until then; `until: null`
 * clears it so the item reappears now.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const parsed = await parseBody(req, snoozeSchema);
  if (!parsed.ok) return parsed.response;

  // Ownership first — a notification you don't own is a 404 regardless of `until`.
  const owned = await prisma.notification.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });
  if (!owned || owned.userId !== user.id) {
    throw new HttpError(404, "Notification not found");
  }

  const { until } = parsed.data;
  if (until === null) {
    await prisma.notification.update({ where: { id: params.id }, data: { snoozedUntil: null } });
    return NextResponse.json({ ok: true, snoozedUntil: null });
  }

  const when = new Date(until);
  if (when.getTime() <= Date.now()) {
    throw new HttpError(400, "Snooze time must be in the future.");
  }
  await prisma.notification.update({ where: { id: params.id }, data: { snoozedUntil: when } });
  return NextResponse.json({ ok: true, snoozedUntil: when.toISOString() });
});
