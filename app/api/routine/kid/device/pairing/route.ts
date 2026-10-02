import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requirePerson, route } from "@/lib/session";
import { PAIRING_TTL_MS, formatPairingCode, hashPairingCode, newPairingCode } from "@/lib/device-auth";
import { auditLocation } from "@/lib/location-audit";
import { getBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The child connects THEIR OWN phone (owner, 2026-10-02: the child does nothing —
 * signed in inside the Orbit app, the screen connects the phone by itself). The same
 * single-use 15-minute code a parent makes (P2), but made by the child's own walled
 * login for the child's own Well Being only. Pairing it still tells the parents "a
 * phone was connected" (/api/device/pair), and the phone's own permission prompts
 * still have to be answered once.
 */
export const POST = route(async () => {
  const user = await requirePerson();
  const person = await prisma.person.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!person) throw new HttpError(404, "No Well Being here.");
  await prisma.devicePairing.deleteMany({ where: { personId: person.id, consumedAt: null } });
  const code = newPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await prisma.devicePairing.create({ data: { personId: person.id, codeHash: hashPairingCode(code), expiresAt, createdById: user.id } });
  await auditLocation(person.id, "PAIRING_CODE", { actorUserId: user.id, detail: { expiresAt: expiresAt.toISOString(), by: "child-app" } });
  return NextResponse.json({ code: formatPairingCode(code), expiresAt: expiresAt.toISOString(), serverUrl: getBaseUrl() }, { status: 201 });
});
