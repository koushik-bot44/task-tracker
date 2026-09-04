"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "orbit-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * A quiet install nudge. On Android/desktop it appears when the browser fires
 * `beforeinstallprompt` and drives the real prompt; on iOS Safari — which has
 * no programmatic install — it shows the Add-to-Home-Screen instruction
 * instead. Dismissible and remembered in localStorage.
 *
 * When already installed the whole thing is hidden by a CSS
 * `display-mode: standalone` rule (see globals.css) — no JS matchMedia.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    setHidden(false);

    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    // iOS Safari only; a standalone launch sets navigator.standalone.
    const standalone = (window.navigator as { standalone?: boolean }).standalone === true;
    if (isIOS && !standalone) setShowIOS(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => dismiss();
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — just hide for this session */
    }
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    dismiss();
  };

  if (hidden) return null;
  if (!deferred && !showIOS) return null;

  return (
    <div className="pwa-install pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-sheet border border-line bg-surface p-3 shadow-lift">
        <span
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-card bg-primary text-on-primary"
          aria-hidden
        >
          <Download className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          {deferred ? (
            <>
              <p className="text-sm font-medium text-ink">Install Orbit</p>
              <p className="mt-0.5 text-micro text-muted">
                Add it to your home screen for a full-screen app and alerts.
              </p>
              <button
                type="button"
                onClick={install}
                className="press mt-2 inline-flex h-8 items-center rounded-card bg-primary px-3 text-micro font-medium text-on-primary"
              >
                Install
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">Add Orbit to your home screen</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-micro text-muted">
                Tap
                <Share className="inline h-3.5 w-3.5 text-primary-ink" strokeWidth={2} aria-hidden />
                Share, then <span className="font-medium text-ink">Add to Home Screen</span> — to
                install &amp; enable alerts.
              </p>
            </>
          )}
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
