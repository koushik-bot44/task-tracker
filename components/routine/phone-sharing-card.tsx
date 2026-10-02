"use client";

import { Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { childTracker, type TrackerState } from "@/lib/orbit-app";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Step = { title: string; hint: string; act: () => Promise<TrackerState> };

export type PhoneSetup = {
  /** True inside the Orbit app on a phone (the location engine is there). */
  available: boolean;
  /** Connected, allowed all the time, location on, running. */
  sharing: boolean;
  /** Still connecting (no state from the phone yet, or not paired). */
  connecting: boolean;
  next: Step | null;
  stepNumber: number;
  working: boolean;
  error: string | null;
  run: () => Promise<void>;
  /** Connect again after a failure (the "Try again" button). */
  retry: () => void;
};

/**
 * The child's phone, inside the Orbit app (owner, 2026-10-02): no buttons for the
 * child, no codes. Signed in on this phone, it connects the phone by itself
 * (POST /api/routine/kid/device/pairing) and starts sharing a position about every
 * hour as soon as Android allows it. The only taps are Android's own one-time
 * permission prompts, which a person must answer — a parent can do it.
 */
export function usePhoneSetup(enabled: boolean, onConnected?: () => void): PhoneSetup {
  const tracker = enabled ? childTracker() : null;
  const [state, setState] = useState<TrackerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const connecting = useRef(false);
  const connectedRef = useRef(onConnected);
  connectedRef.current = onConnected;

  const refresh = useCallback(async () => {
    if (!tracker) return;
    try {
      setState(await tracker.getState());
    } catch (e) {
      setError(message(e));
    }
  }, [tracker]);

  // Connect this phone by itself (on open, and again from "Try again").
  const connect = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!tracker) return;
      setError(null);
      let s = await tracker.getState().catch(() => null);
      if (s && (!s.paired || s.revoked) && !connecting.current) {
        connecting.current = true;
        try {
          const r = await apiPost<{ code: string }>("/api/routine/kid/device/pairing", {});
          s = await tracker.pair({ serverUrl: window.location.origin, code: r.code });
          connectedRef.current?.();
        } catch (e) {
          if (!isCancelled()) setError(message(e));
        } finally {
          connecting.current = false;
        }
      }
      if (!isCancelled() && s) setState(s);
    },
    [tracker],
  );

  // Connect once on open; read the permissions again on coming back from the
  // phone's settings.
  useEffect(() => {
    if (!tracker) return;
    let cancelled = false;
    void connect(() => cancelled);
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
  }, [tracker, refresh, connect]);

  // Sharing starts by itself as soon as everything it needs is allowed.
  useEffect(() => {
    if (!tracker || !state?.paired || state.revoked) return;
    if (state.permission === "ALWAYS" && state.trackingState !== "RUNNING") {
      void tracker.startTracking().then(setState).catch(() => undefined);
    }
  }, [tracker, state]);

  const android = (state?.platform ?? "android") === "android";
  const steps: (Step | null)[] = !tracker || !state || !state.paired
    ? []
    : [
        state.permission !== "WHILE_IN_USE" && state.permission !== "ALWAYS"
          ? { title: "Allow location", hint: "Tap Allow when the phone asks.", act: () => tracker.requestForegroundPermission() }
          : null,
        state.permission !== "ALWAYS"
          ? {
              title: android ? "Allow location all the time" : "Always allow location",
              hint: android ? "On the next screen: Permissions → Location → Allow all the time." : "Choose Change to Always Allow.",
              act: () => tracker.requestBackgroundPermission(),
            }
          : null,
        state.locationEnabled === false
          ? { title: "Turn on location", hint: "The phone's location switch is off.", act: () => tracker.openLocationSettings() }
          : null,
        android && state.batteryOptimized === true
          ? { title: "Let it run in the background", hint: "So the phone doesn't stop it to save battery.", act: () => tracker.requestBatteryExemption() }
          : null,
      ];
  const nextIndex = steps.findIndex(Boolean);
  const next = nextIndex >= 0 ? steps[nextIndex] : null;
  const sharing = Boolean(state?.paired && !state.revoked && state.permission === "ALWAYS" && state.locationEnabled !== false && state.trackingState === "RUNNING");

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

  return {
    available: Boolean(tracker),
    sharing: sharing && !next,
    connecting: Boolean(tracker) && (!state || !state.paired),
    next,
    stepNumber: nextIndex + 1,
    working,
    error,
    run,
    retry: () => void connect(),
  };
}

/** First open in the app (owner, 2026-10-02: "first it takes location, later the
    daily habits dashboard"): one full screen, one big button per step. "Later"
    shows the dashboard for now; this screen comes back on the next open. */
export function PhoneSetupGate({ setup, onLater, overNight }: { setup: PhoneSetup; onLater: () => void; overNight: boolean }) {
  return (
    <section className="pk-glass rounded-sheet px-5 py-8 text-center" aria-label="Location sharing set-up">
      <MapPin className="mx-auto h-10 w-10 pk-fg" strokeWidth={1.75} aria-hidden />
      <h2 className="mt-3 font-display text-xl font-semibold pk-fg">Set up location sharing</h2>
      <p className={cn("mx-auto mt-2 max-w-xs text-sm", overNight ? "text-on-primary" : "pk-fg-soft")}>
        One time only — a parent can do it. Then it works by itself, about every hour.
      </p>
      {setup.error && !setup.next ? (
        <div className="mt-6">
          <p className="text-sm text-danger-ink">{setup.error}</p>
          <button type="button" onClick={setup.retry} className="press mt-4 inline-flex h-14 w-full items-center justify-center rounded-card bg-primary px-4 text-lg font-semibold text-on-primary">
            Try again
          </button>
        </div>
      ) : setup.connecting ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm pk-fg">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Connecting this phone…
        </div>
      ) : setup.next ? (
        <div className="mt-6">
          <p className="text-sm pk-fg">{setup.next.hint}</p>
          <button type="button" onClick={() => void setup.run()} disabled={setup.working} className="press mt-4 inline-flex h-14 w-full items-center justify-center gap-2 rounded-card bg-primary px-4 text-lg font-semibold text-on-primary disabled:opacity-50">
            {setup.working ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {setup.next.title}
          </button>
        </div>
      ) : (
        <p className="mt-6 text-sm pk-fg">Starting…</p>
      )}
      {setup.error && setup.next ? <p className="mt-3 text-sm text-danger-ink">{setup.error}</p> : null}
      <button type="button" onClick={onLater} className="press mt-6 h-11 rounded-card px-4 text-sm pk-fg-soft">
        Later
      </button>
    </section>
  );
}

/** After "Later": the same next step as a small box above the day, until sharing runs. */
export function PhoneSharingCard({ setup, overNight }: { setup: PhoneSetup; overNight: boolean }) {
  if (!setup.available || setup.sharing) return null;
  return (
    <section className="pk-glass mb-4 rounded-card px-4 py-4" aria-label="Location sharing set-up (later)">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="pk-fg text-sm font-semibold">{setup.connecting ? "Connecting this phone…" : "Finish setting up location sharing"}</p>
          {setup.next ? <p className={cn("mt-1 text-sm", overNight ? "text-on-primary" : "pk-fg-soft")}>{setup.next.hint}</p> : null}
          {setup.next ? (
            <button type="button" onClick={() => void setup.run()} disabled={setup.working} className="press mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-card bg-primary px-4 text-base font-semibold text-on-primary disabled:opacity-50">
              {setup.working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {setup.next.title}
            </button>
          ) : null}
          {setup.error ? <p className="mt-2 text-sm text-danger-ink">{setup.error}</p> : null}
          {setup.error && !setup.next ? (
            <button type="button" onClick={setup.retry} className="press mt-3 inline-flex h-12 w-full items-center justify-center rounded-card bg-primary px-4 text-base font-semibold text-on-primary">
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
