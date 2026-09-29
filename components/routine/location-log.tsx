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
  return p.source === "CHECKIN" ? "check-in" : p.source === "APP" ? "app" : p.source === "DEVICE" ? (p.trigger === "LOCATE_NOW" ? "Locate Now" : "phone") : "phone app";
}

/** "45 min", "1 h 20 min". */
const gapWords = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/**
 * The day's timeline (2026-09-25; gaps and accuracy since 2026-09-29): every
 * position in the order it happened — time, where, how, how precise — and a row
 * wherever nothing came in for a while, so a quiet stretch is never mistaken for
 * staying put. A fix that reached the server much later than it was taken says so.
 */
export function LocationLog({
  points,
  loading,
  emptyText,
  gaps = [],
}: {
  points: LocationPointDTO[];
  loading: boolean;
  emptyText: string;
  gaps?: { fromId: string; toId: string; minutes: number; km: number }[];
}) {
  const ordered = [...points].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (loading) return <p className="py-2 text-sm pk-fg-soft">Loading…</p>;
  if (ordered.length === 0) return <p className="py-2 text-sm pk-fg-soft">{emptyText}</p>;
  const gapAfter = new Map(gaps.map((g) => [g.fromId, g]));
  return (
    <ol className="space-y-1.5">
      {ordered.map((p) => {
        const hasSpot = !(p.lat === 0 && p.lng === 0);
        const late = p.receivedAt && Date.parse(p.receivedAt) - Date.parse(p.at) > 5 * 60_000;
        const gap = gapAfter.get(p.id);
        return (
          <li key={p.id}>
            <div className="flex items-center gap-3 rounded-card pk-cell px-3 py-2">
              <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums pk-fg">{clockTime(p.at)}</span>
              {p.source === "CHECKIN" ? <MapPin className="h-4 w-4 shrink-0 text-ok-ink" aria-hidden /> : <Smartphone className="h-4 w-4 shrink-0 pk-fg-soft" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm", hasSpot || p.place ? "pk-fg" : "pk-fg-soft")}>{whereLabel(p)}</p>
                <p className="truncate text-micro pk-fg-soft">
                  {howLabel(p)}
                  {p.accuracy ? ` · ±${Math.round(p.accuracy)} m` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                  {p.battery !== null ? ` · battery ${p.battery}%` : ""}
                  {late ? ` · arrived ${clockTime(p.receivedAt!)}` : ""}
                </p>
              </div>
            </div>
            {gap ? (
              <p className="my-1.5 rounded-card border border-dashed border-[color:var(--pk-cell-bd)] px-3 py-1.5 text-micro pk-fg-soft">
                No data for {gapWords(gap.minutes)}{gap.km >= 0.5 ? ` · ${gap.km} km apart` : ""} — where the phone was in between is not known.
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
