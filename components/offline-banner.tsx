"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The offline state (LOOK: loading · empty · error · offline). One quiet
 * line under the top bar while the browser reports no connection; it
 * disappears on its own when the connection is back. Nothing else changes —
 * what is already on screen stays readable.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-micro font-medium text-warn-ink">
      <WifiOff className="h-4 w-4" strokeWidth={2} aria-hidden />
      You&apos;re offline. Orbit will catch up when you&apos;re back.
    </div>
  );
}
