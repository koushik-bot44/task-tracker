"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getInstallServerSnapshot, getInstallSnapshot, promptInstall, startInstallCapture, subscribeInstall } from "@/lib/pwa/install-store";

/** Which way of installing this browser offers. */
export type InstallPlatform = "ios" | "android" | "desktop-chromium" | "mac-safari" | "desktop-firefox" | "other";

/**
 * Read from the user agent, in an order that matters: every iPhone browser is
 * Safari underneath (and an iPad claims to be a Mac, with a touch screen);
 * Android before Firefox, since Firefox on Android can install; Chrome and Edge
 * before Safari, since their user agents say "Safari" too.
 */
export function detectInstallPlatform(ua: string, platform = "", maxTouchPoints = 0): InstallPlatform {
  if (/iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/firefox|fxios/i.test(ua)) return "desktop-firefox";
  if (/chrome|chromium|crios|edg\//i.test(ua)) return "desktop-chromium";
  if (/macintosh/i.test(ua) && /safari/i.test(ua)) return "mac-safari";
  return "other";
}

function runningInstalled(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Install state for this browser. `platform` is null until the page is in the
 * browser, so nothing is drawn that the server could disagree with.
 */
export function useInstall() {
  const store = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getInstallServerSnapshot);
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    startInstallCapture();
    setPlatform(detectInstallPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0));
    const media = window.matchMedia?.("(display-mode: standalone)");
    const update = () => setStandalone(runningInstalled());
    update();
    media?.addEventListener?.("change", update);
    return () => media?.removeEventListener?.("change", update);
  }, []);

  return {
    platform,
    /** Open inside the installed app, or installed moments ago from this page. */
    installed: standalone || store.installedNow,
    /** The browser has offered to install and the offer is still unused. */
    canPrompt: Boolean(store.offer),
    promptInstall,
  };
}
