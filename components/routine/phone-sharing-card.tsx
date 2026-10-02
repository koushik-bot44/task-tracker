"use client";

import { Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { childTracker, type TrackerState } from "@/lib/orbit-app";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The child's phone, inside the Orbit app (owner, 2026-10-02): no buttons for the
 * child, no codes. Signed in on this phone, the screen connects the phone by itself
 * and starts sharing its position about every hour. The only taps are the phone's
 * own permission prompts, which Android makes a person answer once — a parent can do
 * it while setting the phone up. Once running it shows nothing at all.
 */
export function PhoneSharingCard({ onConnected, overNight }: { onConnected?: () => void; overNight: boolean }) {
  const tracker = childTracker();
  const [state, setState] = useState<TrackerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const connecting = useRef(false);

  const refresh = useCallback(async () => {
    if (!tracker) return;
    try {
      setState(await tracker.getState());
    } catch (e) {
      setError(message(e));
    }
  }, [tracker]);

  // Connect this phone by itself, once; read the permissions again on coming back
  // from the phone's settings.
  useEffect(() => {
    if (!tracker) return;
    let cancelled = false;
    void (async () => {
      let s = await tracker.getState().catch(() => null);
      if (s && (!s.paired || s.revoked) && !connecting.current) {
        connecting.current = true;
        try {
          const r = await apiPost<{ code: string }>("/api/routine/kid/device/pairing", {});
          s = await tracker.pair({ serverUrl: window.location.origin, code: r.code });
          onConnected?.();
        } catch (e) {
          if (!cancelled) setError(message(e));
        } finally {
          connecting.current = false;
        }
      }
      if (!cancelled && s) setState(s);
    })();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    let sub: { remove(): void } | null = null;
    const added = tracker.addListener?.("stateChange", (s) => setState(s));
    if (added && "then" in added) void added.then((h) => (sub = h));
    else if (added) sub = added;
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      sub?.remove();
    };
  }, [tracker, refresh, onConnected]);

  // Sharing starts by itself as soon as everything it needs is allowed.
  useEffect(() => {
    if (!tracker || !state?.paired || state.revoked) return;
    if (state.permission === "ALWAYS" && state.trackingState !== "RUNNING") {
      void tracker.startTracking().then(setState).catch(() => undefined);
    }
  }, [tracker, state]);

  if (!tracker) return null;

  const android = (state?.platform ?? "android") === "android";
  const next: { title: string; hint: string; act: () => Promise<TrackerState> } | null = !state || !state.paired
    ? null
    : state.permission !== "WHILE_IN_USE" && state.permission !== "ALWAYS"
      ? { title: "Allow location", hint: "Tap Allow when the phone asks.", act: () => tracker.requestForegroundPermission() }
      : state.permission !== "ALWAYS"
        ? {
            title: android ? "Allow location all the time" : "Always allow location",
            hint: android ? "On the next screen: Permissions → Location → Allow all the time." : "Choose Change to Always Allow.",
            act: () => tracker.requestBackgroundPermission(),
          }
        : state.locationEnabled === false
          ? { title: "Turn on location", hint: "The phone's location switch is off.", act: () => tracker.openLocationSettings() }
          : android && state.batteryOptimized === true
            ? { title: "Let it run in the background", hint: "So the phone doesn't stop it to save battery.", act: () => tracker.requestBatteryExemption() }
            : null;

  const sharing = Boolean(state?.paired && !state.revoked && state.permission === "ALWAYS" && state.locationEnabled !== false && state.trackingState === "RUNNING");

  // Running: nothing on the child's screen (owner, 2026-10-02). The phone's own
  // "Sharing location with your family" notice, which Android requires, stays.
  if (sharing && !next) return null;

  const run = async () => {
    if (!next) return;
    setWorking(true);
    setError(null);
    try {
      setState(await next.act());
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="pk-glass mb-4 rounded-card px-4 py-4" aria-label="Location sharing set-up">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="pk-fg text-sm font-semibold">{!state || !state.paired ? "Connecting this phone…" : "One-time set-up (a parent can do this)"}</p>
          {next ? <p className={cn("mt-1 text-sm", overNight ? "text-on-primary" : "pk-fg-soft")}>{next.hint}</p> : null}
          {next ? (
            <button type="button" onClick={run} disabled={working} className="press mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-card bg-primary px-4 text-base font-semibold text-on-primary disabled:opacity-50">
              {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {next.title}
            </button>
          ) : !state || !state.paired ? (
            <Loader2 className="mt-2 h-4 w-4 animate-spin pk-fg-soft" aria-hidden />
          ) : (
            <p className="mt-1 text-sm pk-fg-soft">Starting…</p>
          )}
          {error ? <p className="mt-2 text-sm text-danger-ink">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
