"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ROLE_LABEL, type UserRole } from "@/lib/types";

const inputClass =
  "h-12 w-full rounded-input border border-line bg-surface px-4 text-base text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";

type Info =
  | { state: "loading" }
  | { state: "valid"; name: string; email: string; role: UserRole }
  | { state: "expired" | "consumed" | "unknown" | "error" };

/**
 * The set-password onboarding page. First impression for a new teammate, and
 * often opened on a phone — so it stays a single clean card at any width. It
 * validates the token on load and shows a distinct, friendly state for expired,
 * used, or unknown links.
 */
export function SetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [info, setInfo] = useState<Info>({ state: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/invite/${token}/validate`)
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as Info | null;
        if (live) setInfo(body && "state" in body ? body : { state: "error" });
      })
      .catch(() => live && setInfo({ state: "error" }));
    return () => {
      live = false;
    };
  }, [token]);

  const ready = password.length >= 8 && password === confirm;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !ready) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not set your password.");
        setPending(false);
        if (res.status === 410) setInfo({ state: "consumed" });
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-10">
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 flex items-center gap-2">
          <Image src="/orbit-logo.png" alt="Orbit" width={256} height={256} className="h-7 w-7 rounded-lg" />
          <span className="font-display text-lg font-semibold text-ink">Orbit</span>
        </div>

        <div className="rounded-sheet border border-line bg-surface p-6 shadow-e2">
          {info.state === "loading" ? (
            <div className="flex h-40 items-center justify-center text-muted">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
          ) : info.state === "valid" ? (
            <>
              <h1 className="font-display text-xl font-semibold text-ink">Set your password</h1>
              <p className="mt-1 text-sm text-muted">
                Welcome, {info.name.split(/\s+/)[0]}. Choose a password to activate your account.
              </p>

              <dl className="mt-4 space-y-1 rounded-card bg-hover px-3 py-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Email</dt>
                  <dd className="min-w-0 truncate text-ink">{info.email}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Role</dt>
                  <dd className="text-ink">{ROLE_LABEL[info.role]}</dd>
                </div>
              </dl>

              <form onSubmit={onSubmit} className="mt-4 space-y-3">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password (8+ characters)"
                  aria-label="New password"
                  className={inputClass}
                  autoFocus
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  aria-label="Repeat password"
                  className={inputClass}
                />
                {confirm.length > 0 && password !== confirm ? (
                  <p className="text-sm text-danger">Those two don&apos;t match.</p>
                ) : null}
                <button
                  type="submit"
                  disabled={!ready || pending}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-input bg-primary text-base font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90 disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Set password &amp; sign in
                </button>
                <div className="min-h-[1.25rem]" aria-live="polite">
                  {error ? <p className="text-sm text-danger">{error}</p> : null}
                </div>
              </form>
            </>
          ) : (
            <DeadLink state={info.state} />
          )}
        </div>
      </motion.div>
    </main>
  );
}

function DeadLink({ state }: { state: "expired" | "consumed" | "unknown" | "error" }) {
  const copy = {
    expired: {
      title: "This invite has expired",
      body: "Invite links last 72 hours. Ask your manager to send you a fresh one.",
    },
    consumed: {
      title: "This invite was already used",
      body: "Your account is set up. Head to sign-in, or ask your manager to resend if you're stuck.",
    },
    unknown: {
      title: "This link isn't valid",
      body: "Double-check the link from your email, or ask your manager to resend the invite.",
    },
    error: {
      title: "Something went wrong",
      body: "We couldn't check this invite. Please try again in a moment.",
    },
  }[state];

  return (
    <div className="text-center">
      <h1 className="font-display text-xl font-semibold text-ink">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted">{copy.body}</p>
      <a
        href="/login"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-input bg-primary px-5 text-sm font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90"
      >
        Go to sign-in
      </a>
    </div>
  );
}
