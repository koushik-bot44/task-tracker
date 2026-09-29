import { createHash, randomBytes } from "node:crypto";
import type { ChildDevice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";

/**
 * Device credentials and pairing codes (2026-09-29, automatic location).
 *
 * A phone is enrolled only by a parent's explicit pairing code. On pairing it
 * receives a random 256-bit token; the server keeps only its SHA-256, so a
 * leaked table cannot be turned into working device credentials. The token is
 * sent as `Authorization: Bearer <token>`; revocation and rotation take effect
 * on the next request.
 */

export const DEVICE_TOKEN_PREFIX = "odt_";
export function newDeviceToken(): string {
  return DEVICE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 32 letters and digits with no look-alikes (no 0/O/1/I). 32 divides 256, so a
    byte maps without bias: 8 characters = 40 bits, alive 15 minutes, used once. */
export const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_TTL_MS = 15 * 60_000;
export function newPairingCode(): string {
  return Array.from(randomBytes(8), (b) => PAIRING_ALPHABET[b % 32]).join("");
}
/** "abcd-efgh", " ABCD EFGH " -> "ABCDEFGH"; anything that is not 8 of our characters -> null. */
export function normalizePairingCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 8 && [...c].every((ch) => PAIRING_ALPHABET.includes(ch)) ? c : null;
}
/** Peppered with AUTH_SECRET: the stored hash is useless without the secret. */
export function hashPairingCode(code: string): string {
  return createHash("sha256").update(`pair|${code}|${process.env.AUTH_SECRET ?? ""}`).digest("hex");
}
/** "ABCDEFGH" -> "ABCD-EFGH", easier to read out and type. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** At most this many device requests a minute, per phone. */
export const DEVICE_RATE_PER_MINUTE = 30;

/**
 * The gate for every device endpoint. Unknown token -> 401 DEVICE_UNAUTHORIZED;
 * revoked phone -> 401 DEVICE_REVOKED (the app then clears itself and stops);
 * more than 30 requests a minute -> 429 RATE_LIMITED. The counter lives in the
 * device row, so it holds across serverless instances.
 */
export async function requireDevice(req: Request): Promise<ChildDevice> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith(DEVICE_TOKEN_PREFIX) || token.length < 40) {
    throw new HttpError(401, "This phone is not enrolled.", "DEVICE_UNAUTHORIZED");
  }
  const device = await prisma.childDevice.findUnique({ where: { tokenHash: hashDeviceToken(token) } });
  if (!device) throw new HttpError(401, "This phone is not enrolled.", "DEVICE_UNAUTHORIZED");
  if (device.revokedAt) throw new HttpError(401, "This phone was removed by a parent.", "DEVICE_REVOKED");

  const now = new Date();
  const windowOpen = device.rateWindowStart && now.getTime() - device.rateWindowStart.getTime() < 60_000;
  if (!windowOpen) {
    await prisma.childDevice.update({ where: { id: device.id }, data: { rateWindowStart: now, rateWindowCount: 1 } });
  } else if (device.rateWindowCount >= DEVICE_RATE_PER_MINUTE) {
    throw new HttpError(429, "Too many requests from this phone. Try again in a minute.", "RATE_LIMITED");
  } else {
    await prisma.childDevice.update({ where: { id: device.id }, data: { rateWindowCount: { increment: 1 } } });
  }
  return device;
}
