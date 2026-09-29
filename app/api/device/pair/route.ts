import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, route } from "@/lib/session";
import { devicePairSchema, parseBody } from "@/lib/validation";
import { clientIp, hashIp, isRateLimited, recordFailure } from "@/lib/login-attempts";
import { hashDeviceToken, hashPairingCode, newDeviceToken, normalizePairingCode } from "@/lib/device-auth";
import { DEVICE_CONFIG, parentUserIds } from "@/lib/device-service";
import { auditLocation } from "@/lib/location-audit";
import { notifyUsers } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * D1 — a child's phone enrolls with the code a parent made (2026-09-29).
 * PUBLIC (the code is the authorisation), single use, 15 minutes to live, and
 * failed tries are counted per address (8 a minute). On success the phone gets
 * its own token once; only the token's hash is kept. The parents are told a
 * phone was connected, so an unexpected pairing never goes unseen.
 */
export const POST = route(async (req: Request) => {
  const ipKey = hashIp(`pair:${clientIp(req)}`);
  if (await isRateLimited(ipKey)) throw new HttpError(429, "Too many tries. Wait a minute and try again.", "RATE_LIMITED");

  const parsed = await parseBody(req, devicePairSchema);
  if (!parsed.ok) return parsed.response;
  const { platform, appVersion, model, osVersion, name } = parsed.data;

  const invalid = async () => {
    await recordFailure(ipKey);
    return new HttpError(404, "That code didn't work. Ask your parent for a new one.", "PAIRING_INVALID");
  };
  const code = normalizePairingCode(parsed.data.code);
  if (!code) throw await invalid();
  const now = new Date();
  const pairing = await prisma.devicePairing.findUnique({ where: { codeHash: hashPairingCode(code) } });
  if (!pairing || pairing.consumedAt || pairing.expiresAt < now) throw await invalid();
  // Claimed atomically: two phones racing on one code, only one wins.
  const claimed = await prisma.devicePairing.updateMany({ where: { id: pairing.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
  if (claimed.count !== 1) throw await invalid();

  const token = newDeviceToken();
  const device = await prisma.childDevice.create({
    data: {
      personId: pairing.personId,
      platform,
      appVersion,
      model: model || null,
      osVersion: osVersion || null,
      name: name || model || null,
      tokenHash: hashDeviceToken(token),
      enrolledById: pairing.createdById,
      lastContactAt: now,
    },
  });
  await prisma.devicePairing.update({ where: { id: pairing.id }, data: { deviceId: device.id } });
  const person = await prisma.person.findUnique({ where: { id: pairing.personId }, select: { name: true } });
  await auditLocation(pairing.personId, "DEVICE_PAIRED", { deviceId: device.id, detail: { platform, model: model ?? null, codeMadeBy: pairing.createdById } });
  await notifyUsers(await parentUserIds(pairing.personId), {
    type: "routine.location",
    title: `A phone was connected for ${person?.name ?? "your child"}`,
    body: `${device.name ?? platform} now shares its location. If this wasn't you, remove it in Well Being → Location.`,
    url: "/routine",
    tag: `device-paired-${device.id}`,
  });
  return NextResponse.json({ deviceId: device.id, deviceToken: token, personName: person?.name ?? "", config: DEVICE_CONFIG }, { status: 201 });
});
