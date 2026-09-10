"use client";

import { Check, Download } from "lucide-react";
import { useTurnOnAlerts } from "@/components/pwa/push-ask";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useInstall } from "@/lib/hooks/use-install";

/**
 * Install the app — on the account page, always there to come back to.
 *
 * The bottom pop-up offers this once and is gone when closed; this section says,
 * for the browser in hand, exactly how to put Orbit on the home screen or dock,
 * and once it is installed, offers the one thing still worth doing: turning on
 * notifications.
 */
export function InstallAppRow() {
  const { platform, installed, canPrompt, promptInstall } = useInstall();
  const { permission, serverConfigured, busy, turnOn } = useTurnOnAlerts();
  const { show: toast } = useToast();

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast({ message: "Installing Orbit…" });
  };

  let body: React.ReactNode = null;

  if (platform === null) {
    body = <p className="text-sm text-muted">Checking what this browser can do…</p>;
  } else if (installed) {
    body = (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ok-soft text-ok-ink" aria-hidden>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          Installed ✓
        </p>
        {permission === "unsupported" ? (
          <p className="text-sm text-muted">This device can&apos;t show Orbit&apos;s notifications.</p>
        ) : permission === "granted" ? (
          <p className="text-sm text-muted">Notifications are on for this device.</p>
        ) : permission === "denied" ? (
          <p className="text-sm text-muted">Notifications are blocked for Orbit. Allow them in this device&apos;s settings.</p>
        ) : serverConfigured ? (
          <>
            <p className="text-sm text-muted">Turn on notifications so new tasks reach you even when Orbit is closed.</p>
            <Button variant="primary" full loading={busy} onClick={() => void turnOn()}>
              Turn on notifications
            </Button>
          </>
        ) : null}
      </div>
    );
  } else if ((platform === "desktop-chromium" || platform === "android") && canPrompt) {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted">Put Orbit on your {platform === "android" ? "home screen" : "computer"}. It opens in its own window, like any other app.</p>
        <Button variant="primary" full onClick={() => void install()}>
          <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
          Install Orbit
        </Button>
        <p className="text-micro text-muted">Your browser will ask you to confirm.</p>
      </div>
    );
  } else if (platform === "desktop-chromium") {
    body = (
      <p className="text-sm text-muted">
        Use the install button at the right end of the address bar, or open the browser menu and choose <strong className="font-medium text-ink">Install Orbit</strong> (in Edge it is under Apps).
      </p>
    );
  } else if (platform === "android") {
    body = (
      <p className="text-sm text-muted">
        Open the browser menu <span aria-hidden>⋮</span> and choose <strong className="font-medium text-ink">Install app</strong> or <strong className="font-medium text-ink">Add to Home screen</strong>.
      </p>
    );
  } else if (platform === "ios") {
    body = (
      <div className="space-y-3">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
          <li>Open Orbit in Safari.</li>
          <li>
            Tap <strong className="font-medium">Share</strong> — the square with an arrow pointing up.
          </li>
          <li>
            Scroll down, tap <strong className="font-medium">Add to Home Screen</strong>, then <strong className="font-medium">Add</strong>.
          </li>
        </ol>
        <p className="rounded-input bg-hover px-3 py-2 text-micro text-ink">
          On iPhone and iPad, notifications only work once Orbit is on your Home Screen. Open it from there, then turn notifications on on this page.
        </p>
      </div>
    );
  } else if (platform === "mac-safari") {
    body = (
      <p className="text-sm text-muted">
        In Safari&apos;s menu bar, choose <strong className="font-medium text-ink">File → Add to Dock</strong>. Orbit then opens in its own window.
      </p>
    );
  } else if (platform === "desktop-firefox") {
    body = (
      <p className="text-sm text-muted">
        Firefox can&apos;t install websites as apps. To install Orbit, open it in <strong className="font-medium text-ink">Chrome</strong> or{" "}
        <strong className="font-medium text-ink">Edge</strong> — you can keep using it here as well.
      </p>
    );
  } else {
    body = <p className="text-sm text-muted">This browser doesn&apos;t offer installing. Chrome and Edge do on a computer; Safari does on iPhone and iPad.</p>;
  }

  return (
    <section className="mt-6" aria-label="Install the app" id="install">
      <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-muted">Install the app</h2>
      <Card className="p-4">{body}</Card>
    </section>
  );
}
