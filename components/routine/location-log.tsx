"use client";

import { MapPin, Smartphone } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LocationPointDTO } from "@/lib/types";

/** "8:12 am" in IST. */
export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Where a position reads as: his own word for it, else the named place it is
    near, else just a spot on the map. */
export function whereLabel(p: LocationPointDTO): string {
  if (p.placeName) return p.placeName;
  if (p.source === "CHECKIN" && p.place) return p.place;
  if (p.lat === 0 && p.lng === 0) return "no position";
  return "on the map";
}

/** How the position was got, in plain words. */
export function howLabel(p: LocationPointDTO): string {
  return p.source === "CHECKIN" ? "check-in" : p.source === "APP" ? "app" : "phone";
}

/**
 * The day's log (2026-09-25): every position of the day in the order it happened —
 * time, where, how — so a day reads like a punch card.
 */
export function LocationLog({ points, loading, emptyText }: { points: LocationPointDTO[]; loading: boolean; emptyText: string }) {
  const ordered = [...points].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (loading) return <p className="py-2 text-sm pk-fg-soft">Loading…</p>;
  if (ordered.length === 0) return <p className="py-2 text-sm pk-fg-soft">{emptyText}</p>;
  return (
    <ol className="space-y-1.5">
      {ordered.map((p) => {
        const hasSpot = !(p.lat === 0 && p.lng === 0);
        return (
          <li key={p.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2">
            <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums pk-fg">{clockTime(p.at)}</span>
            {p.source === "CHECKIN" ? <MapPin className="h-4 w-4 shrink-0 text-ok-ink" aria-hidden /> : <Smartphone className="h-4 w-4 shrink-0 pk-fg-soft" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", hasSpot || p.place ? "pk-fg" : "pk-fg-soft")}>{whereLabel(p)}</p>
              <p className="truncate text-micro pk-fg-soft">
                {howLabel(p)}
                {p.note ? ` · ${p.note}` : ""}
                {p.battery !== null ? ` · battery ${p.battery}%` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
