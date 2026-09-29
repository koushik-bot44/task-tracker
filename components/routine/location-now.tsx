"use client";

import { AlertTriangle, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Crosshair, Loader2, Smartphone, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { useLatestLocation, useLocateRequest, useLocationMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
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

function Battery({ level, charging }: { level: number; charging: boolean | null }) {
  const Icon = charging ? BatteryCharging : level <= 15 ? BatteryLow : level <= 60 ? BatteryMedium : BatteryFull;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm tabular-nums", level <= 15 && !charging ? "text-danger-ink" : "pk-fg")}>
      <Icon className="h-4 w-4" aria-hidden /> {level}%{charging ? " charging" : ""}
    </span>
  );
}

const FINAL = ["FULFILLED", "FAILED", "EXPIRED"];

/**
 * The top of the parent's Location tab (2026-09-29): what the phone says right
 * now, how fresh that is by the phone's own clock, how precise, the battery,
 * which phone — and Locate Now, whose progress is shown step by step and never
 * faked. The card's `data` comes from GET /api/routine/location/latest.
 */
export function LocationNow({ personId, personName, onAddPhone }: { personId: string | null; personName: string; onAddPhone: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const latest = useLatestLocation(personId, Boolean(activeId));
  const data: LatestLocationDTO | undefined = latest.data;
  const locate = useLocateRequest(activeId, personId);
  const { locateNow } = useLocationMutations(personId);
  const { show: toast } = useToast();
  const qc = useQueryClient();

  // A request made earlier (another tab, a reload) is picked up and followed.
  useEffect(() => {
    const p = data?.pendingLocate;
    if (!activeId && p && !FINAL.includes(p.status)) setActiveId(p.id);
  }, [data?.pendingLocate, activeId]);

  const req = locate.data?.request ?? (activeId && data?.pendingLocate?.id === activeId ? data.pendingLocate : null);
  const settled = req ? FINAL.includes(req.status) : true;
  useEffect(() => {
    if (req && FINAL.includes(req.status)) void qc.invalidateQueries({ queryKey: ["routine-latest"] });
  }, [req, qc]);

  // The "4 min ago" words keep themselves fresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), activeId ? 1000 : 15_000);
    return () => window.clearInterval(t);
  }, [activeId]);

  const press = () =>
    locateNow.mutate(undefined, {
      onSuccess: (r) => setActiveId(r.request.id),
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });

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

  const { status, device, latest: point, freshness, issues } = data;
  const pointAge = freshness ? ago(freshness.recordedAt, now) : null;

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5" aria-labelledby="loc-now">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="loc-now" className="font-display text-lg font-semibold pk-fg">Where {personName} is</h2>
          <p className="mt-0.5 truncate text-micro pk-fg-soft">
            {device ? (
              <>
                <Smartphone className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                {device.name ?? device.model ?? (device.platform === "IOS" ? "iPhone" : "Android phone")}
                {device.lastContactAt ? ` · in touch ${ago(device.lastContactAt, now)}` : ""}
              </>
            ) : (
              "No phone set up yet"
            )}
          </p>
        </div>
        <StatePill state={status.state} label={status.label} />
      </div>

      {point ? (
        <div className="mt-3">
          <p className="font-display text-xl font-semibold leading-snug pk-fg">{whereLabel(point)}</p>
          <p className="mt-1 text-sm pk-fg">
            <span className="font-semibold">{status.state === "ACTIVE" ? "Updated" : "Last known"} {pointAge}</span>
            <span className="pk-fg-soft"> · {clockTime(point.at)}</span>
            {point.accuracy ? <span className="pk-fg-soft"> · ±{Math.round(point.accuracy)} m</span> : null}
          </p>
          {freshness?.delayedUpload && freshness.receivedAt ? (
            <p className="mt-0.5 text-micro text-warn-ink">Reached Orbit at {clockTime(freshness.receivedAt)} — the phone was offline when it took this.</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm pk-fg-soft">No position has arrived yet.</p>
      )}

      <p className={cn("mt-2 text-sm", status.state === "ACTIVE" ? "pk-fg-soft" : "pk-fg")}>{status.message}</p>

      {device ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {device.batteryLevel !== null ? <Battery level={device.batteryLevel} charging={device.isCharging} /> : null}
          {device.networkType ? (
            <span className="inline-flex items-center gap-1 text-sm pk-fg">
              <Wifi className="h-4 w-4" aria-hidden /> {device.networkType === "WIFI" ? "Wi-Fi" : device.networkType === "CELLULAR" ? "Mobile data" : device.networkType === "NONE" ? "No network" : "Network unknown"}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        {device ? (
          <button
            type="button"
            onClick={press}
            disabled={!data.canLocate || locateNow.isPending || !settled}
            className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-card bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50 sm:w-auto"
          >
            {locateNow.isPending || !settled ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Crosshair className="h-4 w-4" aria-hidden />}
            Locate Now
          </button>
        ) : (
          <button type="button" onClick={onAddPhone} className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-card bg-primary px-4 text-sm font-semibold text-on-primary sm:w-auto">
            <Smartphone className="h-4 w-4" aria-hidden /> Set up {personName}&apos;s phone
          </button>
        )}
        {device && !data.canLocate ? <p className="mt-1.5 text-micro pk-fg-soft">You can look; asking the phone for a fresh position is for the parents who can edit.</p> : null}
        {req ? (
          <p className={cn("mt-2 text-sm", req.status === "FAILED" || req.status === "EXPIRED" ? "text-warn-ink" : req.status === "FULFILLED" ? "text-ok-ink" : "pk-fg")} role="status" aria-live="polite">
            {req.status === "FULFILLED" && req.point ? `Fresh position received — updated ${ago(req.point.at, now)}.` : req.message}
          </p>
        ) : null}
      </div>

      {issues.length > 0 ? (
        <ul className="mt-4 space-y-1.5" aria-label="Things to fix on the phone">
          {issues.map((i) => (
            <li key={i.code} className="flex items-start gap-2 rounded-card pk-cell px-3 py-2">
              <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", i.severity === "high" ? "text-danger-ink" : i.severity === "medium" ? "text-warn-ink" : "pk-fg-soft")} aria-hidden />
              <span className="min-w-0 text-sm pk-fg">{i.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
