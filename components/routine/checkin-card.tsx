"use client";

import { Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { usePersonCheckIn } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { LocationPointDTO } from "@/lib/types";
import { inputCls, prettyDate } from "./shared";

/** The places on the card — the same list the server offers. */
const PLACES = ["Home", "School", "Tutor", "Tennis", "Other"] as const;

/** "8:12 am" in IST. */
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** The IST day key ("YYYY-MM-DD") an instant falls on. */
const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * The person's "Where are you?" card (2026-09-25). Pick a place, add a note if
 * you like, tap Check in. The phone's position rides along when the browser
 * allows it; when it does not, the check-in still counts — a place and a time
 * are the point, the dot on the map is a bonus.
 */
export function CheckInCard({ lastSeen }: { lastSeen: LocationPointDTO | null }) {
  const [place, setPlace] = useState<(typeof PLACES)[number]>("Home");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);
  const checkIn = usePersonCheckIn();
  const { show: toast } = useToast();

  const label = place === "Other" ? other.trim() : place;
  const busy = locating || checkIn.isPending;

  const send = (coords?: { lat: number; lng: number; accuracy?: number }) => {
    checkIn.mutate(
      { place: label, note: note.trim() || undefined, ...coords },
      {
        onSuccess: () => {
          setNote("");
          toast({ message: coords ? `Checked in at ${label}` : `Checked in at ${label} (no location)` });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  const tap = () => {
    if (!label) return toast({ message: "Say where you are.", tone: "danger" });
    if (label.length > 40) return toast({ message: "Keep the place under 40 letters.", tone: "danger" });
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          const { latitude, longitude, accuracy } = pos.coords;
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            // A wildly coarse fix is left off the line rather than refused by the server (review, 2026-09-25).
            send({ lat: latitude, lng: longitude, ...(Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000 ? { accuracy } : {}) });
          } else send();
        },
        () => {
          setLocating(false);
          send();
        },
        { timeout: 10000, maximumAge: 60000 },
      );
    } else send();
  };

  const last = lastSeen && lastSeen.source === "CHECKIN" ? lastSeen : null;
  const lastDay = last ? istDay(new Date(last.at)) : null;
  const lastIsToday = lastDay === istDay(new Date());

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
        <h2 className="font-display text-lg font-semibold pk-fg">Where are you?</h2>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Place">
        {PLACES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlace(p)}
            aria-pressed={place === p}
            className={cn("pk-press h-11 rounded-card px-4 text-sm font-medium transition-colors", place === p ? "bg-primary text-on-primary" : "pk-cell pk-fg")}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mb-3 space-y-2">
        {place === "Other" ? (
          <input value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !busy) tap(); }} disabled={busy} maxLength={40} placeholder="Where?" aria-label="Where?" className={inputCls} />
        ) : null}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) tap(); }}
          disabled={busy}
          maxLength={120}
          placeholder="Add a note (optional)"
          aria-label="Add a note (optional)"
          className={inputCls}
        />
      </div>

      <button type="button" onClick={tap} disabled={busy} className="press flex h-11 w-full items-center justify-center gap-2 rounded-card bg-primary text-sm font-medium text-on-primary disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {locating ? "Finding you…" : "Check in"}
      </button>

      <p className="mt-3 text-sm pk-fg-soft">
        {last && lastDay
          ? `Last check-in: ${last.place ?? "somewhere"} · ${lastIsToday ? "" : `${prettyDate(lastDay)} `}${clockTime(last.at)}`
          : "No check-in yet today"}
      </p>
    </section>
  );
}
