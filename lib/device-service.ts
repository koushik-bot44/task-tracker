import type { ChildDevice, LocateRequest, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { notifyUsers } from "@/lib/notify";
import { deviceIssues, deviceStatus, type DeviceState } from "@/lib/device-status";
import { pushReadyFor, sendLocateNowPush } from "@/lib/device-push";
import { auditLocation } from "@/lib/location-audit";
import { LOCATION_SELECT, serializeLocation } from "@/lib/routine";
import type { DeviceDTO, LatestLocationDTO, LocateRequestDTO, LocateStatus } from "@/lib/types";

/**
 * The automatic-location service (2026-09-29): what happens when a phone pairs,
 * uploads, checks in or answers a Locate Now, and what a parent is shown.
 * Routes stay thin; the rules live here. See records/plans/device-tracking-plan.md.
 */

/** What the phone is told to do. The OS decides exact timing; these are targets. */
// Owner, 2026-10-02: "not continuously — every hour the child's location should go",
// to spare the battery. The phone asks Android for one low-power position about every
// hour (GPS only briefly, about hourly, while moving) and checks in hourly. It KEEPS a
// position only when ~an hour has passed since the last one it kept — or the phone
// moved more than 5 km (the phone's maximum), so positions other apps happen to wake
// up are dropped instead of sent every minute. Android may run it a little late to
// save battery: "about every hour". Every check-in hands the phone this config, so
// installed apps switch over by themselves.
export const DEVICE_CONFIG = {
  heartbeatSeconds: 3600,
  movingIntervalSeconds: 3600,
  stationaryIntervalSeconds: 3600,
  distanceFilterMeters: 5000,
  locateTimeoutSeconds: 30,
  maxBatch: 200,
} as const;

/** A Locate Now is answered within this, or it is honestly EXPIRED. */
export const LOCATE_TTL_MS = 5 * 60_000;
/** Per child, per hour. */
export const LOCATE_PER_HOUR = 20;
const ACTIVE_LOCATE: LocateStatus[] = ["PENDING", "SENT", "DELIVERED"];

/* ── Who the parents are (for alerts) ─────────────────────────────────────── */

/** The people who own the child's Well Being: the manager when that is the CEO,
    otherwise the CEO accounts (the same rule as access). Co-parents' walled
    logins have no bell or push, so they are not written to. */
export async function parentUserIds(personId: string): Promise<string[]> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { manager: { select: { id: true, role: true } } } });
  if (person?.manager.role === "FOUNDER") return [person.manager.id];
  return (await prisma.user.findMany({ where: { role: "FOUNDER", disabledAt: null }, select: { id: true } })).map((u) => u.id);
}

/* ── Serialising ──────────────────────────────────────────────────────────── */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function serializeDevice(d: ChildDevice, now = new Date()): DeviceDTO {
  const pushReady = pushReadyFor(d);
  return {
    id: d.id,
    platform: d.platform === "IOS" ? "IOS" : "ANDROID",
    name: d.name,
    model: d.model,
    osVersion: d.osVersion,
    appVersion: d.appVersion,
    createdAt: d.createdAt.toISOString(),
    permission: d.permission,
    preciseLocation: d.preciseLocation,
    locationEnabled: d.locationEnabled,
    notificationsAllowed: d.notificationsAllowed,
    batteryOptimized: d.batteryOptimized,
    trackingState: d.trackingState,
    batteryLevel: d.batteryLevel,
    isCharging: d.isCharging,
    networkType: d.networkType,
    queueSize: d.queueSize,
    pushReady,
    lastHeartbeatAt: iso(d.lastHeartbeatAt),
    lastLocationAt: iso(d.lastLocationAt),
    lastContactAt: iso(d.lastContactAt),
    status: deviceStatus(d, now),
    issues: deviceIssues(d, pushReady),
  };
}

export async function activeDevices(personId: string): Promise<ChildDevice[]> {
  return prisma.childDevice.findMany({
    where: { personId, revokedAt: null },
    orderBy: [{ lastContactAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
}

/* ── Locate Now ───────────────────────────────────────────────────────────── */

const FAILURE_WORDS: Record<string, string> = {
  PERMISSION_DENIED: "location permission is off on the phone",
  LOCATION_DISABLED: "the phone's location switch is off",
  TIMEOUT: "the phone could not get a fix in time (maybe indoors)",
  UNAVAILABLE: "the phone's location service was unavailable",
  OTHER: "something went wrong on the phone",
};

function locateMessage(r: LocateRequest): string {
  switch (r.status as LocateStatus) {
    case "PENDING":
      return r.pushProvider === "NONE" || !r.pushProvider
        ? "Waiting for the phone to check in — it does so about every 15 minutes."
        : "Requesting a fresh location…";
    case "SENT":
      return "Sent to the phone. Waiting for it to answer…";
    case "DELIVERED":
      return "The phone got the request and is finding its position…";
    case "FULFILLED":
      return "Fresh position received.";
    case "FAILED":
      return `The phone could not answer: ${FAILURE_WORDS[r.failureReason ?? "OTHER"] ?? FAILURE_WORDS.OTHER}.`;
    case "EXPIRED":
      return "No answer within 5 minutes. The phone may be offline, switched off or asleep; its last known position is shown.";
    default:
      return "";
  }
}

export async function serializeLocate(r: LocateRequest): Promise<LocateRequestDTO> {
  const point = r.locationPointId
    ? await prisma.locationPoint.findUnique({ where: { id: r.locationPointId }, select: LOCATION_SELECT })
    : null;
  return {
    id: r.id,
    status: r.status as LocateStatus,
    message: locateMessage(r),
    requestedAt: r.requestedAt.toISOString(),
    sentAt: iso(r.sentAt),
    deliveredAt: iso(r.deliveredAt),
    fulfilledAt: iso(r.fulfilledAt),
    expiresAt: r.expiresAt.toISOString(),
    failureReason: r.failureReason,
    pushProvider: r.pushProvider,
    point: point ? serializeLocation(point) : null,
  };
}

/** Requests past their time are EXPIRED, stored so, never left looking alive. */
export async function expireLocateRequests(where: Prisma.LocateRequestWhereInput = {}): Promise<number> {
  const r = await prisma.locateRequest.updateMany({
    where: { ...where, status: { in: ACTIVE_LOCATE }, expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return r.count;
}

/** What the phone still has to answer (the phone acks DELIVERED itself). */
export async function pendingLocateFor(deviceId: string) {
  await expireLocateRequests({ deviceId });
  const rows = await prisma.locateRequest.findMany({
    where: { deviceId, status: { in: ["PENDING", "SENT"] } },
    orderBy: { requestedAt: "asc" },
    select: { id: true, requestedAt: true, expiresAt: true },
  });
  return rows.map((r) => ({ id: r.id, requestedAt: r.requestedAt.toISOString(), expiresAt: r.expiresAt.toISOString() }));
}

export async function requestLocateNow(personId: string, actorUserId: string): Promise<{ request: LocateRequestDTO; reused: boolean }> {
  const device = (await activeDevices(personId))[0];
  if (!device) throw new HttpError(409, "No phone is set up to share this child's location yet.", "NO_DEVICE");
  await expireLocateRequests({ personId });

  // One at a time: a second press while one is on its way shows the same request.
  const open = await prisma.locateRequest.findFirst({ where: { personId, status: { in: ACTIVE_LOCATE } }, orderBy: { requestedAt: "desc" } });
  if (open) return { request: await serializeLocate(open), reused: true };

  const lastHour = await prisma.locateRequest.count({ where: { personId, requestedAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
  if (lastHour >= LOCATE_PER_HOUR) throw new HttpError(429, "That's a lot of Locate Now requests this hour. The phone keeps sharing on its own; try again later.", "RATE_LIMITED");

  const created = await prisma.locateRequest.create({
    data: { personId, deviceId: device.id, requestedById: actorUserId, expiresAt: new Date(Date.now() + LOCATE_TTL_MS) },
  });
  const push = await sendLocateNowPush(device, created.id);
  if (push.tokenInvalid) await prisma.childDevice.update({ where: { id: device.id }, data: { pushToken: null } });
  const updated = await prisma.locateRequest.update({
    where: { id: created.id },
    data: { pushProvider: push.provider, pushDetail: push.detail, ...(push.ok ? { status: "SENT", sentAt: new Date() } : {}) },
  });
  await auditLocation(personId, "LOCATE_NOW", { actorUserId, deviceId: device.id, detail: { requestId: created.id, push: push.provider, delivered: push.ok } });
  return { request: await serializeLocate(updated), reused: false };
}

/** The phone says it got the request, or why it cannot answer. */
export async function recordLocateStatus(device: ChildDevice, requestId: string, input: { status: "DELIVERED" | "FAILED"; reason?: string; detail?: string }): Promise<void> {
  const r = await prisma.locateRequest.findFirst({ where: { id: requestId, deviceId: device.id } });
  if (!r) throw new HttpError(404, "No such request for this phone.", "NOT_FOUND");
  await prisma.childDevice.update({ where: { id: device.id }, data: { lastContactAt: new Date() } });
  if (r.status === "FULFILLED" || r.status === "FAILED") return; // already settled
  if (input.status === "DELIVERED") {
    await prisma.locateRequest.update({ where: { id: r.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  } else {
    await prisma.locateRequest.update({ where: { id: r.id }, data: { status: "FAILED", failureReason: input.reason ?? "OTHER", pushDetail: input.detail ?? r.pushDetail } });
  }
}

/* ── Uploads ──────────────────────────────────────────────────────────────── */

export type DevicePointIn = {
  clientId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt: string;
  trigger?: string;
  locateRequestId?: string | null;
  batteryLevel?: number | null;
  isCharging?: boolean | null;
  networkType?: string | null;
};

const FUTURE_SLACK_MS = 10 * 60_000;
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;

/** Why a point cannot be stored, or null. Nothing is ever corrected or invented. */
export function rejectReason(p: DevicePointIn, now: Date): string | null {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) return "BAD_COORDINATES";
  if (p.lat === 0 && p.lng === 0) return "BAD_COORDINATES";
  const t = new Date(p.recordedAt).getTime();
  if (!Number.isFinite(t)) return "BAD_TIME";
  if (t > now.getTime() + FUTURE_SLACK_MS) return "FUTURE_TIME";
  if (t < now.getTime() - MAX_AGE_MS) return "TOO_OLD";
  if (p.accuracy != null && (!Number.isFinite(p.accuracy) || p.accuracy < 0)) return "BAD_ACCURACY";
  return null;
}

export async function ingestPoints(device: ChildDevice, points: DevicePointIn[]) {
  const now = new Date();
  const rejected: { clientId: string; reason: string }[] = [];
  const seen = new Set<string>();
  const valid: DevicePointIn[] = [];
  let inBatchDuplicates = 0;
  for (const p of points) {
    const reason = rejectReason(p, now);
    if (reason) { rejected.push({ clientId: p.clientId, reason }); continue; }
    if (seen.has(p.clientId)) { inBatchDuplicates++; continue; }
    seen.add(p.clientId);
    valid.push(p);
  }
  const already = valid.length
    ? new Set((await prisma.locationPoint.findMany({ where: { deviceId: device.id, clientId: { in: valid.map((p) => p.clientId) } }, select: { clientId: true } })).map((r) => r.clientId))
    : new Set<string>();
  const fresh = valid.filter((p) => !already.has(p.clientId));
  const created = fresh.length
    ? await prisma.locationPoint.createManyAndReturn({
        data: fresh.map((p) => ({
          personId: device.personId,
          deviceId: device.id,
          clientId: p.clientId,
          source: "DEVICE",
          at: new Date(p.recordedAt),
          receivedAt: now,
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy ?? null,
          altitude: p.altitude ?? null,
          speed: p.speed != null && p.speed >= 0 ? p.speed : null,
          heading: p.heading != null && p.heading >= 0 ? p.heading : null,
          battery: p.batteryLevel != null ? Math.round(p.batteryLevel) : null,
          isCharging: p.isCharging ?? null,
          networkType: p.networkType ?? null,
          trigger: p.trigger ?? "BACKGROUND",
        })),
        skipDuplicates: true, // a racing retry of the same clientId is ignored, not doubled
        select: { id: true, clientId: true, at: true },
      })
    : [];
  const duplicates = inBatchDuplicates + already.size + (fresh.length - created.length);

  // The phone's own newest fix moves "last location"; a late, older upload does not.
  const newest = fresh.filter((p) => created.some((c) => c.clientId === p.clientId)).sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))[0];
  const newestAt = newest ? new Date(newest.recordedAt) : null;
  await prisma.childDevice.update({
    where: { id: device.id },
    data: {
      lastContactAt: now,
      ...(newestAt && (!device.lastLocationAt || newestAt > device.lastLocationAt)
        ? {
            lastLocationAt: newestAt,
            ...(newest!.batteryLevel != null ? { batteryLevel: Math.round(newest!.batteryLevel) } : {}),
            ...(newest!.isCharging != null ? { isCharging: newest!.isCharging } : {}),
            ...(newest!.networkType ? { networkType: newest!.networkType } : {}),
          }
        : {}),
    },
  });

  // A fix taken for a Locate Now settles that request.
  for (const p of fresh) {
    if (!p.locateRequestId) continue;
    const row = created.find((c) => c.clientId === p.clientId);
    if (!row) continue;
    await prisma.locateRequest.updateMany({
      where: { id: p.locateRequestId, deviceId: device.id, status: { in: ["PENDING", "SENT", "DELIVERED", "EXPIRED"] } },
      data: { status: "FULFILLED", fulfilledAt: now, locationPointId: row.id },
    });
  }
  return { accepted: created.length, duplicates, rejected };
}

/* ── Heartbeats and alerts ────────────────────────────────────────────────── */

export type DeviceStatusIn = {
  permission: string;
  locationEnabled: boolean;
  trackingState: string;
  preciseLocation?: boolean | null;
  notificationsAllowed?: boolean | null;
  batteryOptimized?: boolean | null;
  batteryLevel?: number | null;
  isCharging?: boolean | null;
  networkType?: string | null;
  appVersion?: string;
  osVersion?: string;
  pushProvider?: string | null;
  pushToken?: string | null;
  queueSize?: number | null;
  lastShutdownAt?: string | null;
  bootedAt?: string | null;
  event?: string;
};

const parseTime = (v: string | null | undefined, now: Date): Date | null => {
  if (!v) return null;
  const t = new Date(v);
  return Number.isFinite(t.getTime()) && t.getTime() <= now.getTime() + FUTURE_SLACK_MS ? t : null;
};

export async function applyHeartbeat(device: ChildDevice, s: DeviceStatusIn): Promise<ChildDevice> {
  const now = new Date();
  const shutdownReported = parseTime(s.lastShutdownAt, now);
  const updated = await prisma.childDevice.update({
    where: { id: device.id },
    data: {
      permission: s.permission,
      locationEnabled: s.locationEnabled,
      trackingState: s.trackingState,
      ...(s.preciseLocation !== undefined ? { preciseLocation: s.preciseLocation } : {}),
      ...(s.notificationsAllowed !== undefined ? { notificationsAllowed: s.notificationsAllowed } : {}),
      ...(s.batteryOptimized !== undefined ? { batteryOptimized: s.batteryOptimized } : {}),
      ...(s.batteryLevel != null ? { batteryLevel: Math.round(s.batteryLevel) } : {}),
      ...(s.isCharging != null ? { isCharging: s.isCharging } : {}),
      ...(s.networkType ? { networkType: s.networkType } : {}),
      ...(s.appVersion ? { appVersion: s.appVersion } : {}),
      ...(s.osVersion ? { osVersion: s.osVersion } : {}),
      ...(s.pushProvider !== undefined ? { pushProvider: s.pushProvider } : {}),
      ...(s.pushToken !== undefined ? { pushToken: s.pushToken } : {}),
      ...(s.queueSize != null ? { queueSize: s.queueSize } : {}),
      // The phone's own "switching off" notice; a boot report carries the earlier one.
      ...(s.event === "SHUTDOWN" || s.trackingState === "SHUTTING_DOWN" ? { lastShutdownAt: now } : shutdownReported ? { lastShutdownAt: shutdownReported } : {}),
      ...(parseTime(s.bootedAt, now) ? { bootedAt: parseTime(s.bootedAt, now) } : {}),
      lastHeartbeatAt: now,
      lastContactAt: now,
    },
  });
  if (device.permission !== updated.permission || device.locationEnabled !== updated.locationEnabled) {
    await auditLocation(device.personId, "PERMISSION_CHANGED", {
      deviceId: device.id,
      detail: { from: { permission: device.permission, locationEnabled: device.locationEnabled }, to: { permission: updated.permission, locationEnabled: updated.locationEnabled }, event: s.event ?? null },
    });
  }
  await alertOnStateChange(updated, now);
  return updated;
}

/** The states a parent is told about as they happen. DEVICE_OFFLINE waits 3 h
    (a phone without data at school is normal); UNKNOWN comes after a day. */
const ALERT_STATES: DeviceState[] = ["PERMISSION_REVOKED", "LOCATION_DISABLED", "OFFLINE", "POWERED_OFF", "DEVICE_OFFLINE", "UNKNOWN"];
const OFFLINE_ALERT_AFTER_MS = 3 * 60 * 60_000;

export async function alertOnStateChange(device: ChildDevice, now: Date): Promise<void> {
  if (device.revokedAt) return;
  const st = deviceStatus(device, now);
  const quietOffline = st.state === "DEVICE_OFFLINE" && device.lastContactAt && now.getTime() - device.lastContactAt.getTime() < OFFLINE_ALERT_AFTER_MS;
  const alerting = ALERT_STATES.includes(st.state) && !quietOffline && device.lastContactAt !== null;
  if (alerting && device.statusAlertState === st.state) return;
  if (!alerting && !device.statusAlertState) return;

  const person = await prisma.person.findUnique({ where: { id: device.personId }, select: { name: true } });
  const who = person?.name ?? "The child";
  const parents = await parentUserIds(device.personId);
  if (alerting) {
    await notifyUsers(parents, { type: "routine.location", title: `${who}'s phone: ${st.label}`, body: st.message, url: "/routine", tag: `device-${device.id}` });
    await prisma.childDevice.update({ where: { id: device.id }, data: { statusAlertState: st.state, statusAlertedAt: now } });
  } else if (st.state === "ACTIVE") {
    await notifyUsers(parents, { type: "routine.location", title: `${who}'s phone is sharing again`, body: "Location is coming through again.", url: "/routine", tag: `device-${device.id}` });
    await prisma.childDevice.update({ where: { id: device.id }, data: { statusAlertState: null, statusAlertedAt: now } });
  }
}

/* ── What the parent sees ─────────────────────────────────────────────────── */

export async function buildLatest(personId: string, canWrite: boolean): Promise<LatestLocationDTO> {
  const now = new Date();
  const [devices, latest, person, recentLocate] = await Promise.all([
    activeDevices(personId),
    prisma.locationPoint.findFirst({ where: { personId }, orderBy: { at: "desc" }, select: LOCATION_SELECT }),
    prisma.person.findUnique({ where: { id: personId }, select: { locationRetentionDays: true } }),
    (async () => {
      await expireLocateRequests({ personId });
      return prisma.locateRequest.findFirst({ where: { personId, requestedAt: { gte: new Date(now.getTime() - 10 * 60_000) } }, orderBy: { requestedAt: "desc" } });
    })(),
  ]);
  const device = devices[0] ?? null;
  const dto = device ? serializeDevice(device, now) : null;
  const recordedAt = latest ? latest.at : null;
  return {
    status: dto ? dto.status : deviceStatus(null, now),
    device: dto,
    latest: latest ? serializeLocation(latest) : null,
    freshness: latest && recordedAt
      ? {
          recordedAt: recordedAt.toISOString(),
          receivedAt: latest.receivedAt ? latest.receivedAt.toISOString() : null,
          ageSeconds: Math.max(0, Math.round((now.getTime() - recordedAt.getTime()) / 1000)),
          delayedUpload: Boolean(latest.receivedAt && latest.receivedAt.getTime() - recordedAt.getTime() > 5 * 60_000),
        }
      : null,
    issues: dto ? dto.issues : [],
    pendingLocate: recentLocate ? await serializeLocate(recentLocate) : null,
    canLocate: canWrite && Boolean(device),
    retentionDays: person?.locationRetentionDays ?? 90,
  };
}

/* ── Housekeeping (daily) ─────────────────────────────────────────────────── */

export async function runLocationHousekeeping(now = new Date()) {
  const persons = await prisma.person.findMany({ select: { id: true, locationRetentionDays: true } });
  let purged = 0;
  for (const p of persons) {
    const cutoff = new Date(now.getTime() - p.locationRetentionDays * 24 * 60 * 60_000);
    const r = await prisma.locationPoint.deleteMany({ where: { personId: p.id, at: { lt: cutoff } } });
    if (r.count > 0) {
      purged += r.count;
      await auditLocation(p.id, "RETENTION_PURGE", { detail: { deleted: r.count, olderThan: cutoff.toISOString(), retentionDays: p.locationRetentionDays } });
    }
  }
  const expired = await expireLocateRequests();
  const oldRequests = await prisma.locateRequest.deleteMany({ where: { requestedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60_000) } } });
  const oldAudit = await prisma.locationAuditEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60_000) } } });
  const oldCodes = await prisma.devicePairing.deleteMany({ where: { consumedAt: null, expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } });
  const devices = await prisma.childDevice.findMany({ where: { revokedAt: null } });
  for (const d of devices) await alertOnStateChange(d, now);
  return { purgedPoints: purged, expiredRequests: expired, deletedRequests: oldRequests.count, deletedAudit: oldAudit.count, deletedCodes: oldCodes.count, devicesChecked: devices.length };
}
