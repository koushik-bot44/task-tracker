"use client";

import { ChevronLeft, ChevronRight, Copy, Loader2, MapPin, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useLocationDay, useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { LocationPointDTO } from "@/lib/types";
import { LocationMapLazy } from "./location-map-lazy";
import { addDays, prettyDate, weekdayShort } from "./shared";

/** "8:12 am" in IST. */
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** "just now", "4 min ago", "2 hr ago", "3 days ago". */
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/**
 * The parent's Map tab (2026-09-25): where the person is now, the day's map,
 * the day's check-ins, and — for the owner only — the switch that lets the
 * phone send its position on its own.
 */
export function LocationSection({ personId, personName, isOwner, today }: { personId: string | null; personName: string; isOwner: boolean; today: string }) {
  // null = today (the server picks); "YYYY-MM-DD" = a specific day.
  const [day, setDay] = useState<string | null>(null);
  const shown = day ?? today;
  const atToday = shown >= today;
  const { data, isLoading } = useLocationDay(day, personId);
  const { setSharing } = useRoutineMutations(null, personId);
  const { show: toast } = useToast();
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  // The "4 min ago" tail keeps itself fresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // The link the owner just minted shows at once; the refetch keeps it after.
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const go = (n: number) => {
    const next = addDays(shown, n);
    setDay(next >= today ? null : next);
  };

  const points: LocationPointDTO[] = data?.points ?? [];
  const checkins = points.filter((p) => p.source === "CHECKIN");
  const phoneCount = points.length - checkins.length;
  const last = data?.lastSeen ?? null;
  const sharingOn = data?.sharing.on ?? false;
  const url = data?.sharing.url ?? freshUrl;

  const turnOn = () => {
    setSharing.mutate(
      { on: true },
      {
        onSuccess: (r) => {
          setFreshUrl(r.url);
          setCopied(false);
          toast({ message: "Sharing is on" });
        },
        onError: err,
      },
    );
  };
  const turnOff = () => {
    if (!window.confirm("Stop sharing? The old link stops working.")) return;
    setSharing.mutate({ on: false }, { onSuccess: () => { setFreshUrl(null); toast({ message: "Sharing is off" }); }, onError: err });
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ message: "Copied" });
    } catch {
      toast({ message: "Could not copy — press and hold the link to copy it.", tone: "danger" });
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-sheet pk-glass p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
          <h2 className="font-display text-lg font-semibold pk-fg">Map</h2>
        </div>

        {/* Day nav — one day at a time, never past today. */}
        <div className="mb-3 flex items-center justify-between gap-2 rounded-card pk-cell px-1 py-1">
          <button type="button" onClick={() => go(-1)} aria-label="Previous day" className="press grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:pk-fg">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="min-w-0 truncate text-center text-sm font-semibold pk-fg">{atToday ? "Today" : `${weekdayShort(shown)} ${prettyDate(shown)}`}</p>
          <button type="button" onClick={() => go(1)} disabled={atToday} aria-label="Next day" className="press grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:pk-fg disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p className="mb-3 text-sm pk-fg">
          {last
            ? `Last seen: ${last.source === "CHECKIN" && last.place ? last.place : "on the map"} · ${clockTime(last.at)}, ${ago(last.at, now)}`
            : isLoading && !data
              ? "Loading…"
              : "No location yet"}
        </p>

        <LocationMapLazy points={points} height={280} />

        <h3 className="mb-2 mt-4 text-sm font-semibold pk-fg">Check-ins</h3>
        {isLoading && !data ? (
          <p className="py-2 text-sm pk-fg-soft">Loading…</p>
        ) : checkins.length === 0 ? (
          <p className="py-2 text-sm pk-fg-soft">{atToday ? "No check-in yet today." : "No check-in that day."}</p>
        ) : (
          <ul className="space-y-2">
            {checkins.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2.5">
                <span className="shrink-0 text-sm font-semibold tabular-nums pk-fg">{clockTime(p.at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm pk-fg">{p.place ?? "Check-in"}</p>
                  {p.note ? <p className="truncate text-micro pk-fg-soft">{p.note}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {phoneCount > 0 ? (
          <p className="mt-2 text-micro pk-fg-soft">{phoneCount === 1 ? "1 phone point" : `${phoneCount} phone points`}</p>
        ) : null}
      </section>

      {isOwner ? (
        <section className="rounded-sheet pk-glass p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
            <h2 className="font-display text-lg font-semibold pk-fg">Phone sharing</h2>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={sharingOn}
            onClick={sharingOn ? turnOff : turnOn}
            disabled={setSharing.isPending || (isLoading && !data)}
            className="press flex min-h-11 w-full items-center justify-between gap-3 rounded-card pk-cell px-3 py-2 text-left disabled:opacity-40"
          >
            <span className="min-w-0 flex-1 text-sm font-medium pk-fg">Share {personName}&rsquo;s phone location</span>
            {setSharing.isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin pk-fg-soft" aria-hidden />
            ) : (
              <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", sharingOn ? "bg-primary" : "bg-[color:var(--pk-cell-bd)]")} aria-hidden>
                <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow-e1 transition-transform", sharingOn ? "translate-x-6" : "translate-x-1")} />
              </span>
            )}
          </button>

          {sharingOn ? (
            <div className="mt-3 space-y-3">
              {url ? (
                <div className="flex items-center gap-2 rounded-card pk-cell p-2">
                  <code className="min-w-0 flex-1 select-all break-all px-1 text-micro pk-fg">{url}</code>
                  <button type="button" onClick={copy} className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary">
                    <Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : (
                <p className="text-sm pk-fg-soft">Sharing is on. Turn it off and on again to see a new link.</p>
              )}
              <ol className="space-y-1.5 text-sm pk-fg">
                <li>1. On his phone install OwnTracks (free, iPhone or Android).</li>
                <li>2. In its settings choose Mode: HTTP and paste this link as the address.</li>
                <li>3. Allow location &lsquo;Always&rsquo;. The app shows it is running — {personName} can always see sharing is on.</li>
                <li>4. His position arrives here on its own; check-ins still work without it.</li>
              </ol>
            </div>
          ) : (
            <p className="mt-3 text-sm pk-fg-soft">Off. Turn it on to get a link for the phone.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
