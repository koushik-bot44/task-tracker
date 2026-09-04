"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiPost } from "@/lib/api";

/**
 * Web-push subscription state for the current browser.
 *
 * Graceful by construction: an unsupported browser, a blocked permission, or a
 * server without VAPID keys never throws — the hook reports a state and the UI
 * simply offers less. The raw browser permission prompt is never fired on load;
 * enable() is only called from an explicit user action.
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushPermission = "unsupported" | "default" | "granted" | "denied";

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "server-unconfigured" | "denied" | "default" | "error" };

/** VAPID public key (URL-safe base64) → the Uint8Array applicationServerKey wants.
    Backed by an explicit ArrayBuffer so it satisfies BufferSource under strict DOM types. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function usePush() {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  // The server needs VAPID keys before any of this can work end to end.
  const serverConfigured = Boolean(VAPID_PUBLIC);

  useEffect(() => {
    if (!isSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermission);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => undefined);
  }, []);

  const enable = useCallback(async (): Promise<EnableResult> => {
    if (!isSupported()) return { ok: false, reason: "unsupported" };
    if (!VAPID_PUBLIC) return { ok: false, reason: "server-unconfigured" };
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") return { ok: false, reason: perm === "denied" ? "denied" : "default" };

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
      }
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await apiPost("/api/push/subscribe", {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        userAgent: navigator.userAgent.slice(0, 500),
      });
      setSubscribed(true);
      return { ok: true };
    } catch (err) {
      console.error("[push] enable failed:", err);
      return { ok: false, reason: "error" };
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<void> => {
    if (!isSupported()) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiDelete("/api/push/subscribe", { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return { permission, subscribed, busy, serverConfigured, enable, disable };
}
