"use client";

import { useEffect, useState } from "react";

/** Local-time hour decides the scene: night is 18:00–05:59, morning otherwise.
    Date-based (NOT a media query) so it follows the viewer's clock, not a colour scheme. */
export function isNightHour(d = new Date()): boolean {
  const h = d.getHours();
  return h < 6 || h >= 18;
}

/**
 * The shared time-of-day scene state for the person screen AND the manager Well
 * Being tab (phase 46 — one source, no parallel copy). Client-only so the server
 * (UTC) and client can't disagree (no hydration flash); re-checks every few minutes
 * so a screen left open flips across the 06:00 / 18:00 boundary on its own.
 *
 * Returns the glass scene class (`pk-day` / `pk-night`, whose CSS custom properties
 * drive the frosted-glass tints + text colours) and the floating-text colour.
 */
export function useTimeScene() {
  const [mounted, setMounted] = useState(false);
  const [night, setNight] = useState(false);
  useEffect(() => {
    setMounted(true);
    const tick = () => setNight(isNightHour());
    tick();
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const overNight = mounted && night;
  return {
    mounted,
    night,
    overNight,
    scene: overNight ? "pk-night" : "pk-day",
    floatText: overNight ? "text-on-primary" : "text-ink",
  } as const;
}
