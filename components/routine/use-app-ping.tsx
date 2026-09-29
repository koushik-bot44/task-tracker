"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePersonPing } from "@/lib/hooks/use-routine";

/**
 * The web app noting where the person is (2026-09-25): when the screen is opened
 * and when it comes back to the front — foreground only. It is NOT background
 * tracking and has no timer (2026-09-29: background location belongs to the
 * enrolled phone app, which the OS schedules; a browser timer stops the moment
 * the page is hidden). `enabled` is false once a phone is enrolled, so the log is
 * not doubled by a second, weaker source.
 */
export function useAppPing(enabled: boolean) {
  const ping = usePersonPing();
  const mutateRef = useRef(ping.mutate);
  mutateRef.current = ping.mutate;

  const note = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        mutateRef.current({ lat: latitude, lng: longitude, ...(Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000 ? { accuracy } : {}) });
      },
      () => {
        /* refused or unavailable: nothing to store */
      },
      { timeout: 15000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    note();
    const onVisible = () => {
      if (document.visibilityState === "visible") note();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, note]);
}
