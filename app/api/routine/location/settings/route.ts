import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { locationSettingsSchema, parseBody } from "@/lib/validation";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import { auditLocation } from "@/lib/location-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P9 — how long positions are kept (7–365 days), owner only. The daily
    housekeeping deletes anything older. */
export const PATCH = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });
  const parsed = await parseBody(req, locationSettingsSchema);
  if (!parsed.ok) return parsed.response;
  const updated = await prisma.person.update({ where: { id: person.id }, data: { locationRetentionDays: parsed.data.retentionDays }, select: { locationRetentionDays: true } });
  await auditLocation(person.id, "RETENTION_CHANGED", { actorUserId: actor.id, detail: { retentionDays: updated.locationRetentionDays } });
  return NextResponse.json({ retentionDays: updated.locationRetentionDays });
});
