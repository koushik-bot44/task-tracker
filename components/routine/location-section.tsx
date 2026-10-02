"use client";

import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { useState } from "react";
import { useLatestLocation, useLocationDay } from "@/lib/hooks/use-routine";
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
 * gaps; and the phone itself (pairing, state, retention, who looked). The older
 * OwnTracks link section is gone (owner, 2026-10-02).
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
    </div>
  );
}
