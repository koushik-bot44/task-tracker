import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireManager, route } from "@/lib/session";
import { personParam, requireRoutineAccess } from "@/lib/routine";
import { auditLocation } from "@/lib/location-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** P3 — remove a phone. Its token stops working at once (the app then clears
    itself and stops sharing); its positions stay in history until retention. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { write: true });
  const device = await prisma.childDevice.findFirst({ where: { id: params.id, personId: person.id, revokedAt: null } });
  if (!device) throw new HttpError(404, "Not found.");
  await prisma.childDevice.update({ where: { id: device.id }, data: { revokedAt: new Date(), revokedById: actor.id, pushToken: null } });
  await prisma.locateRequest.updateMany({ where: { deviceId: device.id, status: { in: ["PENDING", "SENT", "DELIVERED"] } }, data: { status: "EXPIRED" } });
  await auditLocation(person.id, "DEVICE_REVOKED", { actorUserId: actor.id, deviceId: device.id, detail: { name: device.name } });
  return NextResponse.json({ ok: true });
});
