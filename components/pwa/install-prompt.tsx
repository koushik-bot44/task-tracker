"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useInstall } from "@/lib/hooks/use-install";

const DISMISS_KEY = "orbit-install-dismissed";

/**
 * A quiet install nudge. On Android/desktop it appears once the browser has
 * offered to install and drives the real prompt; on iOS Safari — which has no
 * programmatic install — it shows the Add-to-Home-Screen instruction instead.
 * Dismissible and remembered in localStorage.
 *
 * The browser's offer is no longer held here: it lives in the shared store
 * (lib/pwa/install-store.ts), so closing this nudge only hides the nudge — the
 * account page can still install. When already installed the nudge is hidden,
 * both by the store and by a CSS `display-mode: standalone` rule (globals.css).
 */
export function InstallPrompt() {
  const { platform, installed, canPrompt, promptInstall } = useInstall();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    setHidden(false);
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
    await promptInstall();
    dismiss();
  };

  if (hidden || installed) return null;
  const showIOS = platform === "ios";
  if (!canPrompt && !showIOS) return null;

  return (
    <div className="pwa-install pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-sheet border border-line bg-surface p-3 shadow-lift">
        <span
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-card bg-primary text-on-primary"
          aria-hidden
        >
          <Download className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          {canPrompt ? (
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
