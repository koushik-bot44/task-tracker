import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/session";
import { hashDeviceToken, newDeviceToken, requireDevice } from "@/lib/device-auth";
import { auditLocation } from "@/lib/location-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** D5 — the phone swaps its token for a new one; the old one stops working at once. */
export const POST = route(async (req: Request) => {
  const device = await requireDevice(req);
  const token = newDeviceToken();
  await prisma.childDevice.update({ where: { id: device.id }, data: { tokenHash: hashDeviceToken(token), tokenIssuedAt: new Date() } });
  await auditLocation(device.personId, "TOKEN_ROTATED", { deviceId: device.id });
  return NextResponse.json({ deviceToken: token });
});
