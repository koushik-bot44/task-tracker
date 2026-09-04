"use client";

import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PushAsk } from "@/components/pwa/push-ask";

/**
 * One fixed bottom stack for the two PWA nudges, so they queue rather than
 * overlap. Each child decides its own visibility and returns null when it has
 * nothing to say; the container just positions whatever is showing. The push
 * ask sits above the install nudge.
 */
export function PwaNudges() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-drawer flex flex-col items-center gap-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <PushAsk />
      <InstallPrompt />
    </div>
  );
}
