"use client";

import { Share } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useInstall } from "@/lib/hooks/use-install";

/**
 * "Download Orbit app" on an iPhone or iPad (owner, 2026-10-02: it must be an app on
 * the iPhone too). An iPhone cannot install the Android file and Apple allows no
 * one-tap install from a website, so this shows the three Safari steps that put
 * Orbit on the Home Screen: its own icon, full screen, notifications.
 */
export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { installed } = useInstall();
  return (
    <Sheet open={open} onClose={onClose} title="Get the Orbit app on iPhone">
      {installed ? (
        <p className="text-sm text-ink">Orbit is already on this iPhone&apos;s Home Screen — you&apos;re using it now.</p>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>
              Open this page in <strong className="font-medium">Safari</strong>.
            </li>
            <li>
              Tap <strong className="font-medium">Share</strong> <Share className="inline h-4 w-4 align-[-3px]" aria-hidden /> — the square with an arrow pointing up.
            </li>
            <li>
              Scroll down, tap <strong className="font-medium">Add to Home Screen</strong>, then <strong className="font-medium">Add</strong>.
            </li>
          </ol>
          <p className="rounded-input bg-hover px-3 py-2 text-micro text-ink">
            Then open Orbit from its new icon on the Home Screen. On iPhone, notifications work once Orbit is opened from there.
          </p>
        </div>
      )}
    </Sheet>
  );
}
