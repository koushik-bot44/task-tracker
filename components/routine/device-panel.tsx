"use client";

import { ChevronDown, Copy, Download, History, Plus, ShieldCheck, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useDevices, useLocationAudit, useLocationMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { DevicePairingDTO, LocationAuditDTO } from "@/lib/types";
import { ago, StatePill } from "./location-now";

const PERMISSION_WORDS: Record<string, string> = {
  ALWAYS: "Location: all the time",
  WHILE_IN_USE: "Location: only while open",
  DENIED: "Location: not allowed",
  NOT_DETERMINED: "Location: not asked yet",
  UNKNOWN: "Location: not reported yet",
};

const AUDIT_WORDS: Record<string, string> = {
  VIEW_LATEST: "looked at the location",
  VIEW_HISTORY: "looked at the history",
  LOCATE_NOW: "pressed Locate Now",
  PAIRING_CODE: "made a pairing code",
  DEVICE_PAIRED: "A phone was connected",
  DEVICE_REVOKED: "removed a phone",
  TOKEN_ROTATED: "The phone renewed its key",
  PERMISSION_CHANGED: "The phone's location permission changed",
  RETENTION_CHANGED: "changed how long positions are kept",
  RETENTION_PURGE: "Old positions were deleted",
  SHARING_LINK: "changed the phone sharing link",
};

function auditLine(e: LocationAuditDTO): string {
  const words = AUDIT_WORDS[e.action] ?? e.action;
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const extra =
    e.action === "RETENTION_PURGE" && typeof d.deleted === "number" ? ` (${d.deleted})` :
    e.action === "RETENTION_CHANGED" && typeof d.retentionDays === "number" ? ` to ${d.retentionDays} days` :
    e.action === "VIEW_HISTORY" && typeof d.day === "string" ? ` (${d.day})` : "";
  return e.actorName ? `${e.actorName} ${words}${extra}` : `${words.charAt(0).toUpperCase()}${words.slice(1)}${extra}`;
}

/** Orbit Child for Android, served by this site from public/downloads (2026-10-01).
    No iPhone build yet: that needs a Mac with Xcode and an Apple developer account. */
const APK_PATH = "/downloads/orbit-child.apk";

function AppDownload({ personName, onCopy }: { personName: string; onCopy: (text: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={APK_PATH} download="Orbit-Child.apk" className="press inline-flex h-11 items-center gap-1.5 rounded-card bg-primary px-4 text-sm font-medium text-on-primary">
        <Download className="h-4 w-4" aria-hidden /> Download Orbit Child
      </a>
      <button type="button" onClick={() => onCopy(new URL(APK_PATH, window.location.origin).href)} className="press inline-flex h-11 items-center gap-1.5 rounded-card px-3 text-sm pk-fg-soft hover:bg-[color:var(--pk-cell)]">
        <Copy className="h-4 w-4" aria-hidden /> Copy link
      </button>
      <p className="w-full text-micro pk-fg-soft">Android only. Open it on {personName}&apos;s phone (or send the link) and allow the install. No iPhone version yet.</p>
    </div>
  );
}

/** mm:ss until a moment, ticking. */
function useCountdown(until: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [until]);
  if (!until) return "";
  const s = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Phones, pairing, how long positions are kept, and the access log (2026-09-29).
 * Pairing is explicit and visible: a parent makes a code, the child types it on
 * the phone, the parents are told a phone was connected. Removing a phone stops
 * it at once.
 */
export function DevicePanel({
  personId,
  personName,
  canWrite,
  isOwner,
  retentionDays,
  openPairing,
  onPairingShown,
}: {
  personId: string | null;
  personName: string;
  canWrite: boolean;
  isOwner: boolean;
  retentionDays: number;
  openPairing: boolean;
  onPairingShown: () => void;
}) {
  const { data } = useDevices(personId);
  const { createPairing, revokeDevice, setRetention } = useLocationMutations(personId);
  const { show: toast } = useToast();
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const [pairing, setPairing] = useState<DevicePairingDTO | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const audit = useLocationAudit(personId, isOwner && logOpen);
  const left = useCountdown(pairing?.expiresAt ?? null);
  const now = Date.now();

  const makeCode = () => createPairing.mutate(undefined, { onSuccess: (p) => setPairing(p), onError: err });
  // "Set up the phone" on the card above lands here with a fresh code.
  useEffect(() => {
    if (openPairing && canWrite && !pairing && !createPairing.isPending) {
      makeCode();
      onPairingShown();
      document.getElementById("phones")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPairing]);
  const expired = pairing && Date.parse(pairing.expiresAt) <= now;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: "Copied" });
    } catch {
      toast({ message: "Could not copy — select it and copy by hand.", tone: "danger" });
    }
  };

  const devices = data?.devices ?? [];

  return (
    <section id="phones" className="rounded-sheet pk-glass p-4 sm:p-5" aria-labelledby="phones-h">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Smartphone className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
          <h2 id="phones-h" className="font-display text-lg font-semibold pk-fg">{personName}&apos;s phone</h2>
        </div>
        {canWrite && !pairing ? (
          <button type="button" onClick={makeCode} disabled={createPairing.isPending} className="pk-press pk-btn inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card px-3 text-sm font-medium disabled:opacity-40">
            <Plus className="h-4 w-4" aria-hidden /> {devices.length ? "Add another" : "Set up"}
          </button>
        ) : null}
      </div>

      {pairing ? (
        <div className="mb-4 rounded-card pk-cell p-4">
          {expired ? (
            <>
              <p className="text-sm pk-fg">That code has run out.</p>
              <button type="button" onClick={makeCode} className="press mt-2 h-11 rounded-card bg-primary px-4 text-sm font-medium text-on-primary">Make a new code</button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm pk-fg"><b>1.</b> Install Orbit Child on {personName}&apos;s phone:</p>
              <AppDownload personName={personName} onCopy={copy} />
              <p className="mt-4 text-sm pk-fg"><b>2.</b> Open <b>Orbit Child</b> and enter:</p>
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="text-micro pk-fg-soft">Address</dt>
                  <dd className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all text-sm pk-fg">{pairing.serverUrl}</code>
                    <button type="button" onClick={() => copy(pairing.serverUrl)} aria-label="Copy the address" className="press grid h-11 w-11 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)]"><Copy className="h-4 w-4" aria-hidden /></button>
                  </dd>
                </div>
                <div>
                  <dt className="text-micro pk-fg-soft">Code</dt>
                  <dd className="font-display text-3xl font-bold tracking-[0.18em] tabular-nums pk-fg" aria-label={`Code ${pairing.code.split("").join(" ")}`}>{pairing.code}</dd>
                </div>
              </dl>
              <p className="mt-2 text-micro pk-fg-soft">Works once, for {left} more. Then on the phone: allow location <b>all the time</b>, notifications and (Android) battery — the app walks through each.</p>
              <button type="button" onClick={() => setPairing(null)} className="press mt-2 h-11 rounded-card px-3 text-sm pk-fg-soft hover:bg-[color:var(--pk-cell)]">Done</button>
            </>
          )}
        </div>
      ) : null}

      {devices.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm pk-fg-soft">
            No phone is set up yet. {canWrite && !pairing ? "Install Orbit Child on the phone, then tap Set up for a code." : ""}
          </p>
          {pairing ? null : <AppDownload personName={personName} onCopy={copy} />}
        </div>
      ) : (
        <ul className="space-y-2">
          {devices.map((d) => (
            <li key={d.id} className="rounded-card pk-cell px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold pk-fg">{d.name ?? d.model ?? (d.platform === "IOS" ? "iPhone" : "Android phone")}</p>
                  <p className="truncate text-micro pk-fg-soft">
                    {d.platform === "IOS" ? "iPhone" : "Android"}{d.osVersion ? ` · ${d.osVersion}` : ""}{d.appVersion ? ` · app ${d.appVersion}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StatePill state={d.status.state} label={d.status.label} />
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(`Remove ${d.name ?? "this phone"}? It stops sharing at once and needs a new code to come back.`)) revokeDevice.mutate(d.id, { onError: err }); }}
                      aria-label={`Remove ${d.name ?? "this phone"}`}
                      className="press grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-micro pk-fg-soft">
                {PERMISSION_WORDS[d.permission] ?? d.permission}
                {d.lastContactAt ? ` · in touch ${ago(d.lastContactAt, now)}` : " · not in touch yet"}
                {d.lastLocationAt ? ` · last position ${ago(d.lastLocationAt, now)}` : ""}
                {d.pushReady ? " · Locate Now instant" : " · Locate Now at next check-in"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        <div className="mt-4 border-t border-[color:var(--pk-cell-bd)] pt-3">
          <label className="flex flex-wrap items-center justify-between gap-2 text-sm pk-fg">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 pk-fg-soft" aria-hidden /> Keep positions for</span>
            <select
              value={retentionDays}
              onChange={(e) => setRetention.mutate(Number(e.target.value), { onSuccess: () => toast({ message: "Saved" }), onError: err })}
              className="pk-input h-11 rounded-input px-3 text-sm"
              aria-label="Keep positions for"
            >
              {[7, 30, 90, 180, 365].map((n) => <option key={n} value={n}>{n} days</option>)}
            </select>
          </label>
          <p className="mt-1 text-micro pk-fg-soft">Anything older is deleted every night.</p>

          <button type="button" onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen} className="press mt-3 inline-flex h-11 items-center gap-1.5 rounded-card px-2 text-sm font-medium pk-fg hover:bg-[color:var(--pk-cell)]">
            <History className="h-4 w-4 pk-fg-soft" aria-hidden /> Who looked and when
            <ChevronDown className={cn("h-4 w-4 transition-transform", logOpen && "rotate-180")} aria-hidden />
          </button>
          {logOpen ? (
            audit.isLoading ? (
              <p className="py-2 text-sm pk-fg-soft">Loading…</p>
            ) : (audit.data?.events.length ?? 0) === 0 ? (
              <p className="py-2 text-sm pk-fg-soft">Nothing yet.</p>
            ) : (
              <ol className="mt-1 max-h-72 space-y-1 overflow-y-auto">
                {audit.data!.events.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 rounded-card px-2 py-1.5 text-sm">
                    <span className="min-w-0 pk-fg">{auditLine(e)}</span>
                    <span className="shrink-0 text-micro tabular-nums pk-fg-soft">{new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
                  </li>
                ))}
              </ol>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
