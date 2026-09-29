import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import { activeDevices, serializeDevice } from "@/lib/device-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P1 — the phones enrolled for this child, with their state, and whether a
    pairing code is waiting to be used (the code itself is never shown again). */
export const GET = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req));
  const now = new Date();
  const [devices, pairing] = await Promise.all([
    activeDevices(person.id),
    prisma.devicePairing.findFirst({ where: { personId: person.id, consumedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, select: { expiresAt: true } }),
  ]);
  return NextResponse.json({ devices: devices.map((d) => serializeDevice(d, now)), pairingActiveUntil: pairing ? pairing.expiresAt.toISOString() : null });
});
