import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import type { LocationAuditDTO } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P8 — the access log, owner only: the latest 100 events. */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });
  const rows = await prisma.locationAuditEvent.findMany({ where: { personId: person.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const events: LocationAuditDTO[] = rows.map((r) => ({ id: r.id, action: r.action, actorName: r.actorUserId ? names.get(r.actorUserId) ?? null : null, at: r.createdAt.toISOString(), detail: r.detail }));
  return NextResponse.json({ events });
});
