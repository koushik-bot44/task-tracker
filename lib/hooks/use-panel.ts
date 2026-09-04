"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * The detail panel and the zoom root are URL state, so Back closes the panel
 * and a zoomed view can be linked to. Everything goes through replace() rather
 * than push() except opening the panel, which deserves its own history entry
 * precisely so Back can close it.
 */
export function usePanelParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const taskId = params.get("task");
  const rootId = params.get("root");

  const withParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      return query.length > 0 ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );

  const openTask = useCallback(
    (id: string) => router.push(withParam("task", id), { scroll: false }),
    [router, withParam],
  );

  const closeTask = useCallback(
    () => router.replace(withParam("task", null), { scroll: false }),
    [router, withParam],
  );

  const zoomTo = useCallback(
    (id: string | null) => router.push(withParam("root", id), { scroll: false }),
    [router, withParam],
  );

  return { taskId, rootId, openTask, closeTask, zoomTo, withParam };
}
