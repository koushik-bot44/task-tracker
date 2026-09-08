"use client";

import { useEffect, useState } from "react";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PushAsk } from "@/components/pwa/push-ask";

/**
 * One fixed bottom stack for the two PWA nudges, so they queue rather than
 * overlap. Each child decides its own visibility and returns null when it has
 * nothing to say; the container just positions whatever is showing. The push
 * ask sits above the install nudge.
 *
 * Nothing renders until the browser has taken over. Both nudges are decided by
 * things only a browser knows — what is in localStorage, whether the browser
 * offered an install, what the notification permission is — so the server has
 * no business drawing a frame for them, and this subtree can never disagree
 * with the server's HTML (owner, 2026-09-09).
 */
export function PwaNudges() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-drawer flex flex-col items-center gap-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <PushAsk />
      <InstallPrompt />
    </div>
  );
}
