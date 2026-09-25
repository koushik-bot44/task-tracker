"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePersonPing } from "@/lib/hooks/use-routine";

const HOUR_MS = 60 * 60_000;

/**
 * The app noting where the person is (2026-09-25): once on each open, when it
 * comes back to the front, and on the hour while the screen stays open. No
 * in-app switch (the parent, 2026-09-25: it is not the child's choice) — the
 * only question is the phone's own one-time location prompt, which no app can
 * skip; the parent answers it once or sets it in the phone's settings. A browser
 * cannot do this while the app is closed; phone sharing covers that.
 */
export function useAppPing() {
  const ping = usePersonPing();
  const [available, setAvailable] = useState(false);
  const mutateRef = useRef(ping.mutate);
  mutateRef.current = ping.mutate;

  useEffect(() => {
    setAvailable(typeof navigator !== "undefined" && "geolocation" in navigator);
  }, []);

  const note = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        mutateRef.current({ lat: latitude, lng: longitude, ...(Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000 ? { accuracy } : {}) });
      },
      () => {
        /* refused or unavailable: nothing to store; phone sharing still works */
      },
      { timeout: 15000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(() => {
    note();
    const onVisible = () => {
      if (document.visibilityState === "visible") note();
    };
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") note();
    }, HOUR_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(t);
    };
  }, [note]);

  return { available };
}
