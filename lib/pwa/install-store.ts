"use client";

/**
 * The browser's own offer to install Orbit, kept for as long as the page lives.
 *
 * Chrome and Edge fire `beforeinstallprompt` once, early, and only that event
 * can open their install prompt. It used to be caught inside the bottom pop-up,
 * so closing the pop-up — or the pop-up simply not showing — lost it for good,
 * and nothing else could offer to install. It is now caught by a one-line
 * script in the page head before the app loads (app/layout.tsx), adopted here,
 * and shared by every place that offers to install.
 */

export type InstallOffer = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __orbitInstallOffer?: InstallOffer | null;
  }
}

type State = { offer: InstallOffer | null; installedNow: boolean };

let state: State = { offer: null, installedNow: false };
const SERVER_STATE: State = { offer: null, installedNow: false };
const listeners = new Set<() => void>();
let started = false;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

/** Start listening. Safe to call from anywhere, any number of times. */
export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  if (window.__orbitInstallOffer) set({ offer: window.__orbitInstallOffer });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__orbitInstallOffer = event as InstallOffer;
    set({ offer: event as InstallOffer });
  });
  window.addEventListener("appinstalled", () => {
    window.__orbitInstallOffer = null;
    set({ offer: null, installedNow: true });
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getInstallSnapshot = (): State => state;
export const getInstallServerSnapshot = (): State => SERVER_STATE;

/** Open the browser's install prompt. An offer can be used once, whatever the answer. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const offer = state.offer;
  if (!offer) return "unavailable";
  window.__orbitInstallOffer = null;
  set({ offer: null });
  await offer.prompt();
  const choice = await offer.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome;
}
