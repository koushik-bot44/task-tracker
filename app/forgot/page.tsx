"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Public forgot-password page (phase 14). Submitting sends the email to the
 * request endpoint, which always answers the same way — an admin is notified if
 * the account exists — so this page never reveals whether an email is real.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      /* the answer is generic either way */
    }
    setDone(true);
    setBusy(false);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-page-lg font-bold text-ink">Forgot your password?</h1>
        {done ? (
          <p className="mt-3 text-sm text-muted">
            If that account exists, an admin has been notified and will send you a link to set a new
            password. Check your email shortly.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Enter your email and an admin will send you a link to set a new password.
            </p>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@company.com"
                aria-label="Email"
                autoFocus
                className="h-11 w-full rounded-input border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
              />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="press h-11 w-full rounded-card bg-primary text-sm font-medium text-on-primary disabled:opacity-40"
              >
                Send reset request
              </button>
            </form>
          </>
        )}
        <Link href="/login" className="mt-4 inline-block text-sm text-primary-ink hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
