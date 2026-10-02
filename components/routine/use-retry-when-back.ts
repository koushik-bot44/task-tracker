"use client";

import { useEffect, useRef } from "react";

/**
 * A screen with nothing to show because its fetch failed tries again by itself
 * (2026-10-02): when the phone is back online and when the screen comes back to
 * the front. React Query's own reconnect refetch never fires for a page that was
 * opened with no signal (it starts out believing it is online and so never sees a
 * change), so this listens for itself. `active` = failed with no data yet;
 * `retry` = the query's refetch (an answer already on its way is reused, not
 * asked for twice).
 */
export function useRetryWhenBack(active: boolean, retry: (options?: { cancelRefetch?: boolean }) => unknown) {
  const retryRef = useRef(retry);
  retryRef.current = retry;

  useEffect(() => {
    if (!active) return;
    const again = () => {
      if (document.visibilityState === "visible") void retryRef.current({ cancelRefetch: false });
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [active]);
}
