"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Copy, History, Loader2, Smartphone } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useLatestLocation, useLocationDay, useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { LocationPointDTO } from "@/lib/types";
import { LocationMapLazy } from "./location-map-lazy";
import { LocationLog } from "./location-log";
import { LocationNow } from "./location-now";
import { DevicePanel } from "./device-panel";
import { addDays, prettyDate, weekdayShort } from "./shared";

/**
 * The parent's Location tab (2026-09-25; rebuilt 2026-09-29 around the enrolled
 * phone). From the top: where the child is now and how much to trust it, with
 * Locate Now; the map of that one position; the day's history with gaps shown as
 * gaps; the phone itself (pairing, state, retention, who looked); and, folded
 * away, the older OwnTracks link kept until the phone app has proven itself.
 */
export function LocationSection({ personId, personName, isOwner, canWrite, today }: { personId: string | null; personName: string; isOwner: boolean; canWrite: boolean; today: string }) {
  // null = today (the server picks); "YYYY-MM-DD" = a specific day.
  const [day, setDay] = useState<string | null>(null);
  const shown = day ?? today;
  const atToday = shown >= today;
  const history = useLocationDay(day, personId);
  const latest = useLatestLocation(personId, false);
  const [openPairing, setOpenPairing] = useState(false);

  const go = (n: number) => {
    const next = addDays(shown, n);
    setDay(next >= today ? null : next);
  };
  const points: LocationPointDTO[] = history.data?.points ?? [];
  const current = latest.data?.latest ?? null;

  return (
    <div className="space-y-4">
      <LocationNow personId={personId} personName={personName} onAddPhone={() => setOpenPairing(true)} />

      <section className="rounded-sheet pk-glass p-3 sm:p-4" aria-label="Map of the latest position">
        <LocationMapLazy points={current ? [current] : []} height={280} mode="current" />
      </section>

      <section className="rounded-sheet pk-glass p-4 sm:p-5" aria-labelledby="loc-history">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
          <h2 id="loc-history" className="font-display text-lg font-semibold pk-fg">History</h2>
        </div>
        <div className="mb-3 flex items-center justify-between gap-2 rounded-card pk-cell px-1 py-1">
          <button type="button" onClick={() => go(-1)} aria-label="Previous day" className="press grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)]">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="min-w-0 truncate text-center text-sm font-semibold pk-fg">{atToday ? "Today" : `${weekdayShort(shown)} ${prettyDate(shown)}`}</p>
          <button type="button" onClick={() => go(1)} disabled={atToday} aria-label="Next day" className="press grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] disabled:opacity-30">
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <LocationMapLazy points={points} height={260} mode="history" track={history.data?.track} />
        {history.data && history.data.track.gaps.length > 0 ? (
          <p className="mt-2 text-micro pk-fg-soft">Solid line: the route the phone reported. Dashed: no data came in — the route there is not known.</p>
        ) : null}
        <h3 className="mb-2 mt-4 text-sm font-semibold pk-fg">{atToday ? "Today’s log" : "That day’s log"}</h3>
        <LocationLog points={points} loading={history.isLoading && !history.data} emptyText={atToday ? "Nothing yet today." : "Nothing that day."} gaps={history.data?.track.gaps ?? []} />
      </section>

      <DevicePanel
        personId={personId}
        personName={personName}
        canWrite={canWrite}
        isOwner={isOwner}
        retentionDays={latest.data?.retentionDays ?? 90}
        openPairing={openPairing}
        onPairingShown={() => setOpenPairing(false)}
      />

      {isOwner ? <OlderWays personId={personId} personName={personName} sharingOn={history.data?.sharing.on ?? false} sharingUrl={history.data?.sharing.url ?? null} loading={history.isLoading && !history.data} /> : null}
    </div>
  );
}

/** The OwnTracks link (2026-09-25), folded away: it still works, but the enrolled
    phone app is the main path now. Retire it once the phone app has proven itself. */
function OlderWays({ personId, personName, sharingOn, sharingUrl, loading }: { personId: string | null; personName: string; sharingOn: boolean; sharingUrl: string | null; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const { setSharing } = useRoutineMutations(null, personId);
  const { show: toast } = useToast();
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const url = sharingUrl ?? freshUrl;

  const turnOn = () => setSharing.mutate({ on: true }, { onSuccess: (r) => { setFreshUrl(r.url); toast({ message: "Link made" }); }, onError: err });
  const turnOff = () => {
    if (!window.confirm("Turn the old link off? Anything still posting to it stops.")) return;
    setSharing.mutate({ on: false }, { onSuccess: () => { setFreshUrl(null); toast({ message: "Link turned off" }); }, onError: err });
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast({ message: "Copied" }); } catch { toast({ message: "Could not copy — press and hold the link to copy it.", tone: "danger" }); }
  };

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="press flex h-11 w-full items-center justify-between gap-2 rounded-card text-left">
        <span className="inline-flex items-center gap-2 text-sm font-semibold pk-fg"><Smartphone className="h-4 w-4 pk-fg-soft" aria-hidden /> Older way: a location app link</span>
        <ChevronDown className={cn("h-4 w-4 pk-fg-soft transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm pk-fg-soft">Before the Orbit Child app, a free app such as OwnTracks could post {personName}&apos;s position to a secret link. It still works, but the phone set up above is the way to go.</p>
          <button
            type="button"
            role="switch"
            aria-checked={sharingOn}
            onClick={sharingOn ? turnOff : turnOn}
            disabled={setSharing.isPending || loading}
            className="press flex min-h-11 w-full items-center justify-between gap-3 rounded-card pk-cell px-3 py-2 text-left disabled:opacity-40"
          >
            <span className="min-w-0 flex-1 text-sm font-medium pk-fg">Link {sharingOn ? "on" : "off"}</span>
            {setSharing.isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin pk-fg-soft" aria-hidden />
            ) : (
              <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", sharingOn ? "bg-primary" : "bg-[color:var(--pk-cell-bd)]")} aria-hidden>
                <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow-e1 transition-transform", sharingOn ? "translate-x-6" : "translate-x-1")} />
              </span>
            )}
          </button>
          {sharingOn && url ? (
            <div className="flex items-center gap-2 rounded-card pk-cell p-2">
              <code className="min-w-0 flex-1 select-all break-all px-1 text-micro pk-fg">{url}</code>
              <button type="button" onClick={copy} className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary">
                <Copy className="h-4 w-4" aria-hidden /> Copy
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
