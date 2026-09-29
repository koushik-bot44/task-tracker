/**
 * What a parent is told about a child's phone (2026-09-29, automatic location).
 *
 * Pure: facts in, a state and plain words out — no database, so it is tested on
 * its own (scripts/unit-location.ts). "Last known location" is never presented
 * as "current location": ACTIVE needs a recent position AND recent contact.
 *
 *   ACTIVE             in touch, a position from the last 20 min
 *   STALE              in touch, but no fresh position (indoors, GPS off)
 *   OFFLINE            the phone says sharing is stopped in the app
 *   PERMISSION_REVOKED location permission is not "all the time"
 *   LOCATION_DISABLED  the phone's location switch is off
 *   DEVICE_OFFLINE     no contact for 35 min–24 h (no signal, flight mode, off, force-stopped)
 *   POWERED_OFF        the last thing the phone said was "switching off"
 *   UNKNOWN            never in touch, or silent for over a day
 */

export type DeviceState =
  | "ACTIVE"
  | "STALE"
  | "OFFLINE"
  | "PERMISSION_REVOKED"
  | "LOCATION_DISABLED"
  | "DEVICE_OFFLINE"
  | "POWERED_OFF"
  | "UNKNOWN";

/** A position younger than this can be called live. */
export const FRESH_MS = 20 * 60_000;
/** The phone checks in every ~15 min; two misses and it counts as out of touch. */
export const CONTACT_MS = 35 * 60_000;
/** Past a day of silence, what the phone last reported no longer describes it. */
export const SILENT_MS = 24 * 60 * 60_000;
/** A shutdown notice counts as the last word if nothing came within a minute after. */
const SHUTDOWN_SLACK_MS = 60_000;

export type DeviceFacts = {
  revokedAt: Date | null;
  permission: string;
  locationEnabled: boolean | null;
  trackingState: string;
  lastContactAt: Date | null;
  lastLocationAt: Date | null;
  lastShutdownAt: Date | null;
};

export type DeviceStatus = {
  state: DeviceState;
  /** Short, for a pill: "Live", "Stale", … */
  label: string;
  /** One sentence for the parent. */
  message: string;
  /** Since when this is true, when known (ISO). */
  since: string | null;
};

const LABEL: Record<DeviceState, string> = {
  ACTIVE: "Live",
  STALE: "Stale",
  OFFLINE: "Sharing stopped",
  PERMISSION_REVOKED: "Permission off",
  LOCATION_DISABLED: "Location off",
  DEVICE_OFFLINE: "Unreachable",
  POWERED_OFF: "Switched off",
  UNKNOWN: "Unknown",
};

/** "45 min", "2 hr", "3 days". */
export function span(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr`;
  return `${Math.round(h / 24)} days`;
}

function status(state: DeviceState, message: string, since: Date | null): DeviceStatus {
  return { state, label: LABEL[state], message, since: since ? since.toISOString() : null };
}

export function deviceStatus(d: DeviceFacts | null, now: Date): DeviceStatus {
  if (!d || d.revokedAt) return status("UNKNOWN", "No phone is set up to share its location yet.", null);
  if (!d.lastContactAt) return status("UNKNOWN", "The phone is paired but has not been in touch yet.", null);

  const contactAge = now.getTime() - d.lastContactAt.getTime();
  const shutdownWasLast = d.lastShutdownAt !== null && d.lastContactAt.getTime() - d.lastShutdownAt.getTime() <= SHUTDOWN_SLACK_MS;

  if (shutdownWasLast && contactAge > SHUTDOWN_SLACK_MS) {
    return status("POWERED_OFF", `The phone said it was switching off ${span(now.getTime() - d.lastShutdownAt!.getTime())} ago.`, d.lastShutdownAt);
  }
  if (contactAge > SILENT_MS) {
    return status("UNKNOWN", `No word from the phone for ${span(contactAge)}. What it last reported may no longer be true.`, d.lastContactAt);
  }
  if (d.permission === "DENIED" || d.permission === "NOT_DETERMINED") {
    return status("PERMISSION_REVOKED", "Location permission is turned off on the phone.", d.lastContactAt);
  }
  if (d.permission === "WHILE_IN_USE") {
    return status("PERMISSION_REVOKED", "Location is allowed only while the app is open, so sharing stops in the background.", d.lastContactAt);
  }
  if (d.locationEnabled === false) {
    return status("LOCATION_DISABLED", "The phone's location setting is switched off.", d.lastContactAt);
  }
  if (d.trackingState === "STOPPED") {
    return status("OFFLINE", "Location sharing is not running on the phone.", d.lastContactAt);
  }
  if (contactAge > CONTACT_MS) {
    return status("DEVICE_OFFLINE", `The phone has not been in touch for ${span(contactAge)} — no signal, flight mode, switched off, or the app was force-stopped.`, d.lastContactAt);
  }
  if (d.lastLocationAt && now.getTime() - d.lastLocationAt.getTime() <= FRESH_MS) {
    return status("ACTIVE", "Sharing live.", d.lastLocationAt);
  }
  const posAge = d.lastLocationAt ? now.getTime() - d.lastLocationAt.getTime() : null;
  return status(
    "STALE",
    posAge === null
      ? "The phone is in touch but has not sent a position yet."
      : `The phone is in touch, but has no fresh position for ${span(posAge)} — maybe indoors, or GPS is weak.`,
    d.lastLocationAt,
  );
}

export type IssueFacts = DeviceFacts & {
  platform: string;
  preciseLocation: boolean | null;
  notificationsAllowed: boolean | null;
  batteryOptimized: boolean | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  queueSize: number | null;
  pushToken: string | null;
};
export type DeviceIssue = { code: string; severity: "high" | "medium" | "low"; message: string };

/** Everything worth a parent's attention, most serious first. `pushReady` says
    whether the server can reach this platform instantly at all. */
export function deviceIssues(d: IssueFacts, pushReady: boolean): DeviceIssue[] {
  const out: DeviceIssue[] = [];
  if (d.permission !== "ALWAYS" && d.permission !== "UNKNOWN") out.push({ code: "PERMISSION", severity: "high", message: d.permission === "WHILE_IN_USE" ? "Location is allowed only while the app is open. On the phone: Location → Allow all the time." : "Location permission is off. On the phone, open Orbit Child and allow location." });
  if (d.locationEnabled === false) out.push({ code: "LOCATION_OFF", severity: "high", message: "The phone's location switch is off." });
  if (d.preciseLocation === false) out.push({ code: "APPROXIMATE", severity: "medium", message: "Only approximate location is allowed, so positions can be off by kilometres. Turn on Precise location." });
  if (d.platform === "ANDROID" && d.batteryOptimized === true) out.push({ code: "BATTERY_OPTIMISED", severity: "medium", message: "Battery optimisation may stop sharing in the background. On the phone: Battery → Don't restrict." });
  if (d.batteryLevel !== null && d.batteryLevel <= 15 && d.isCharging !== true) out.push({ code: "BATTERY_LOW", severity: "medium", message: `Battery is at ${d.batteryLevel}%.` });
  if (d.notificationsAllowed === false) out.push({ code: "NOTIFICATIONS_OFF", severity: "low", message: "Notifications are off on the phone, so Locate Now has to wait for the next check-in." });
  if (!d.pushToken || !pushReady) out.push({ code: "NO_PUSH", severity: "low", message: "Locate Now reaches this phone at its next check-in (instant delivery is not set up)." });
  if ((d.queueSize ?? 0) > 50) out.push({ code: "BACKLOG", severity: "low", message: `${d.queueSize} positions are waiting on the phone to be sent.` });
  return out;
}
