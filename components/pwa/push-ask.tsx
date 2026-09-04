"use client";

import { Bell, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { usePush } from "@/lib/hooks/use-push";

const DISMISS_KEY = "orbit-push-ask-dismissed";

/**
 * A soft, in-context request for notification permission — NOT the raw browser
 * prompt on load (which gets reflexively denied). It appears only when the
 * browser permission is still "default" AND the server actually has VAPID keys,
 * so we never ask for something that cannot yet work. Dismissible and
 * remembered. Enable() triggers the real browser prompt on the user's click.
 */
export function PushAsk() {
  const { permission, serverConfigured, busy, enable } = usePush();
  const { show: toast } = useToast();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (dismissed) return null;
  if (!serverConfigured) return null; // push not wired on the server yet
  if (permission !== "default") return null; // already granted, denied, or unsupported

  const onEnable = async () => {
    const res = await enable();
    if (res.ok) {
      toast({ message: "Notifications enabled." });
      setDismissed(true);
    } else if (res.reason === "denied") {
      toast({ message: "Notifications blocked — enable them in your browser settings.", tone: "danger" });
      setDismissed(true);
    } else if (res.reason !== "default") {
      toast({ message: "Couldn't enable notifications.", tone: "danger" });
    }
  };

  return (
    <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-sheet border border-line bg-surface p-3 shadow-lift">
        <span
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-card bg-primary-soft text-primary-ink"
          aria-hidden
        >
          <Bell className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Get alerted about meetings &amp; due tasks?</p>
          <p className="mt-0.5 text-micro text-muted">
            Orbit can notify you when something needs you. You can turn this off any time in
            Settings.
          </p>
          <button
            type="button"
            onClick={onEnable}
            disabled={busy}
            className="press mt-2 inline-flex h-8 items-center rounded-card bg-primary px-3 text-micro font-medium text-on-primary disabled:opacity-50"
          >
            {busy ? "Enabling…" : "Enable"}
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-card text-muted hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
    </div>
  );
}
