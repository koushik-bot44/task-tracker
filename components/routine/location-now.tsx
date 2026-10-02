"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useLatestLocation } from "@/lib/hooks/use-routine";
import type { DeviceStateName, LatestLocationDTO } from "@/lib/types";
import { clockTime, whereLabel } from "./location-log";

/** "just now", "12 s ago", "4 min ago", "2 hr ago", "3 days ago". */
export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/** The pill's colour says how much to trust the dot: green live, amber stale, red for anything wrong. */
const PILL: Record<DeviceStateName, string> = {
  ACTIVE: "bg-ok text-on-primary",
  STALE: "bg-warn text-on-primary",
  OFFLINE: "bg-danger text-on-primary",
  PERMISSION_REVOKED: "bg-danger text-on-primary",
  LOCATION_DISABLED: "bg-danger text-on-primary",
  DEVICE_OFFLINE: "bg-danger text-on-primary",
  POWERED_OFF: "bg-danger text-on-primary",
  UNKNOWN: "bg-[color:var(--pk-cell-bd)] pk-fg",
};

export function StatePill({ state, label }: { state: DeviceStateName; label: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-micro font-semibold", PILL[state])}>
      {state === "ACTIVE" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden /> : null}
      {label}
    </span>
  );
}


/**
 * The top of the parent's Location tab. Since 2026-10-02 (owner: "when the app is
 * opened only we track location — keep it like before, shows in the history") the
 * child's position is noted each time the child opens Orbit, nothing in the
 * background, so this card is just where and when: no phone status, no battery,
 * no Locate Now, no phone set-up.
 */
export function LocationNow({ personId, personName }: { personId: string | null; personName: string }) {
  const latest = useLatestLocation(personId, false);
  const data: LatestLocationDTO | undefined = latest.data;

  // The "4 min ago" words keep themselves fresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  if (latest.isLoading && !data) {
    return (
      <section className="rounded-sheet pk-glass p-4 sm:p-5">
        <p className="text-sm pk-fg-soft">Loading…</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="rounded-sheet pk-glass p-4 sm:p-5">
        <p className="text-sm pk-fg">Couldn&apos;t load the location.</p>
        <button type="button" onClick={() => void latest.refetch()} className="press mt-2 h-11 rounded-card bg-primary px-4 text-sm font-medium text-on-primary">Try again</button>
      </section>
    );
  }

  const point = data.latest;
  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5" aria-labelledby="loc-now">
      <h2 id="loc-now" className="font-display text-lg font-semibold pk-fg">Where {personName} is</h2>
      {point ? (
        <div className="mt-3">
          <p className="font-display text-xl font-semibold leading-snug pk-fg">{whereLabel(point)}</p>
          <p className="mt-1 text-sm pk-fg">
            <span className="font-semibold">Last seen {ago(point.at, now)}</span>
            <span className="pk-fg-soft"> · {clockTime(point.at)}</span>
            {point.accuracy ? <span className="pk-fg-soft"> · ±{Math.round(point.accuracy)} m</span> : null}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm pk-fg-soft">No position yet.</p>
      )}
      <p className="mt-2 text-micro pk-fg-soft">Noted each time {personName} opens Orbit.</p>
    </section>
  );
}
