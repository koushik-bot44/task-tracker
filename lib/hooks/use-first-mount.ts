"use client";

import { useEffect, useRef } from "react";

/**
 * True only for the first render pass after mount.
 *
 * List entrance animations must not re-run every time the query refetches on
 * window focus, or every time an optimistic write rewrites the cache — the
 * whole list flickering because someone alt-tabbed back is worse than no
 * animation at all. Components stagger only while this is true.
 */
export function useIsFirstMount(): boolean {
  const first = useRef(true);

  useEffect(() => {
    first.current = false;
  }, []);

  return first.current;
}

/** Stagger delay in seconds, capped so a long list does not crawl in. */
export function staggerDelay(index: number, active: boolean, cap = 10): number {
  if (!active) return 0;
  return Math.min(index, cap) * 0.025;
}
