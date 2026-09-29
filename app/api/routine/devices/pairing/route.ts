import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import { PAIRING_TTL_MS, formatPairingCode, hashPairingCode, newPairingCode } from "@/lib/device-auth";
import { auditLocation } from "@/lib/location-audit";
import { getBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P2 — a parent with write access makes a pairing code for the child's phone:
    8 characters, 15 minutes, single use. Any older unused code dies with it. */
export const POST = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  await prisma.devicePairing.deleteMany({ where: { personId: person.id, consumedAt: null } });
  const code = newPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await prisma.devicePairing.create({ data: { personId: person.id, codeHash: hashPairingCode(code), expiresAt, createdById: actor.id } });
  await auditLocation(person.id, "PAIRING_CODE", { actorUserId: actor.id, detail: { expiresAt: expiresAt.toISOString() } });
  return NextResponse.json({ code: formatPairingCode(code), expiresAt: expiresAt.toISOString(), serverUrl: getBaseUrl() }, { status: 201 });
});
