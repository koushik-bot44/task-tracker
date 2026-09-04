"use client";

import { useEffect } from "react";

/**
 * Registers the minimal service worker (public/sw.js) once, on the client. It
 * exists for installability and push; it caches no data. Failures are swallowed
 * — an unsupported or blocked SW must never surface an error, the app just runs
 * without install/push, exactly as before.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Register after load so it never competes with first paint.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
