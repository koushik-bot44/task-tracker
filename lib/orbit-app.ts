"use client";

import { useEffect, useState } from "react";

/**
 * Inside the Orbit phone app (2026-10-02): the app is a native shell that shows this
 * very site (each person their own screens) with the location engine underneath. The
 * engine is the native "ChildTracker" plugin; the site reaches it through the
 * Capacitor bridge the app puts on its pages. In a normal browser none of this exists.
 */

export type TrackerState = {
  paired: boolean;
  revoked?: boolean;
  permission?: string;
  locationEnabled?: boolean | null;
  trackingState?: string;
  preciseLocation?: boolean | null;
  notificationsAllowed?: boolean | null;
  batteryOptimized?: boolean | null;
  personName?: string;
  serverUrl?: string;
  platform?: string;
  lastFixAt?: string | null;
  lastUploadAt?: string | null;
};

export type ChildTrackerPlugin = {
  getState(): Promise<TrackerState>;
  pair(o: { serverUrl: string; code: string }): Promise<TrackerState>;
  startTracking(): Promise<TrackerState>;
  requestForegroundPermission(): Promise<TrackerState>;
  requestBackgroundPermission(): Promise<TrackerState>;
  requestBatteryExemption(): Promise<TrackerState>;
  openLocationSettings(): Promise<TrackerState>;
  addListener?(event: "stateChange", cb: (s: TrackerState) => void): Promise<{ remove(): void }> | { remove(): void };
};

type Bridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => unknown;
  Plugins?: Record<string, unknown>;
};

function bridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: Bridge }).Capacitor ?? null;
}

/** True inside the Orbit phone app; false in any browser. */
export function inOrbitApp(): boolean {
  const b = bridge();
  if (!b) return false;
  if (b.isNativePlatform) return b.isNativePlatform();
  return Boolean(b.getPlatform && b.getPlatform() !== "web");
}

let tracker: ChildTrackerPlugin | null | undefined;
/** The phone's location engine, or null outside the app. */
export function childTracker(): ChildTrackerPlugin | null {
  if (tracker !== undefined) return tracker;
  const b = bridge();
  if (!b || !inOrbitApp()) return (tracker = null);
  const p = b.registerPlugin ? b.registerPlugin("ChildTracker") : b.Plugins?.ChildTracker;
  return (tracker = (p as ChildTrackerPlugin | undefined) ?? null);
}

/** inOrbitApp() for rendering: false on the server and the first paint, then the
    truth — so the server's HTML and the first client render agree. */
export function useInOrbitApp(): boolean {
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(inOrbitApp()), []);
  return inApp;
}
