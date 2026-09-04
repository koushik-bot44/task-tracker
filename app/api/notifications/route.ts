import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import type { NotificationDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toDTO(n: {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
  snoozedUntil: Date | null;
}): NotificationDTO {
  const url =
    n.data && typeof n.data === "object" && "url" in n.data
      ? String((n.data as { url?: unknown }).url ?? "/")
      : "/";
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
    snoozedUntil: n.snoozedUntil ? n.snoozedUntil.toISOString() : null,
  };
}

/** The caller's notifications for the bell. `items` is the ACTIVE list (newest
    first) — a notification snoozed to a future time is hidden from it and from
    the `unread` badge count until its time passes (the cron then re-activates
    it). `snoozed` carries those hidden items for the "Snoozed (N)" section so
    the user can see and unsnooze them early. Strictly caller-scoped. */
export const GET = route(async () => {
  const user = await requireUser();
  const now = new Date();
  // "Currently snoozed" = a future snoozedUntil. A past value is treated as
  // active here too, so the list is correct even before the cron tick wakes it.
  const activeWhere = {
    userId: user.id,
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
  };
  const [items, unread, snoozed] = await Promise.all([
    prisma.notification.findMany({ where: activeWhere, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { ...activeWhere, readAt: null } }),
    prisma.notification.findMany({
      where: { userId: user.id, snoozedUntil: { gt: now } },
      orderBy: { snoozedUntil: "asc" },
      take: 30,
    }),
  ]);
  return NextResponse.json({
    items: items.map(toDTO),
    unread,
    snoozed: snoozed.map(toDTO),
  });
});
