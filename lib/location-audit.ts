import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The location access log (2026-09-29): who looked, who asked for a fresh
 * position, who paired or removed a phone, what housekeeping deleted. Best
 * effort — a failed log line never fails the action it describes.
 */
export type LocationAuditAction =
  | "VIEW_LATEST"
  | "VIEW_HISTORY"
  | "LOCATE_NOW"
  | "PAIRING_CODE"
  | "DEVICE_PAIRED"
  | "DEVICE_REVOKED"
  | "TOKEN_ROTATED"
  | "PERMISSION_CHANGED"
  | "RETENTION_CHANGED"
  | "RETENTION_PURGE"
  | "SHARING_LINK";

export async function auditLocation(
  personId: string,
  action: LocationAuditAction,
  opts: { actorUserId?: string | null; deviceId?: string | null; detail?: Prisma.InputJsonValue } = {},
): Promise<void> {
  try {
    await prisma.locationAuditEvent.create({
      data: { personId, action, actorUserId: opts.actorUserId ?? null, deviceId: opts.deviceId ?? null, detail: opts.detail ?? undefined },
    });
  } catch (e) {
    console.error("[location-audit] could not record", action, (e as Error).message);
  }
}

/** A dashboard polls; one view row per viewer, child and kind per 10 minutes is enough. */
const VIEW_WINDOW_MS = 10 * 60_000;
export async function auditLocationView(personId: string, actorUserId: string, action: "VIEW_LATEST" | "VIEW_HISTORY", detail?: Prisma.InputJsonValue): Promise<void> {
  try {
    const recent = await prisma.locationAuditEvent.findFirst({
      where: { personId, actorUserId, action, createdAt: { gte: new Date(Date.now() - VIEW_WINDOW_MS) } },
      select: { id: true },
    });
    if (!recent) await auditLocation(personId, action, { actorUserId, detail });
  } catch (e) {
    console.error("[location-audit] view check failed", (e as Error).message);
  }
}
