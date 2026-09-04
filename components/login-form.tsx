"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const inputClass =
  "h-12 w-full rounded-input border border-line bg-surface px-4 text-base text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";

export function LoginForm({ needsBootstrap }: { needsBootstrap: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const ready = needsBootstrap
    ? name.trim() && email.trim() && password.length >= 8 && passcode.length > 0
    : email.trim() && password.length > 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !ready) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch(needsBootstrap ? "/api/auth/bootstrap" : "/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          needsBootstrap ? { passcode, name, email, password } : { email, password },
        ),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not sign in.");
        setPassword("");
        setPending(false);
        return;
      }

      // Phase 35: a PERSON login lands on their own calm screen, never the work app.
      const body = (await res.json().catch(() => null)) as { user?: { role?: string } } | null;
      router.replace(body?.user?.role === "PERSON" ? "/person" : body?.user?.role === "ADMIN" ? "/people" : "/");
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
        <div className="mb-8 text-center">
          <div className="mb-5 flex justify-center">
            <Image src="/orbit-logo.png" alt="Orbit" width={256} height={256} priority className="h-16 w-16 rounded-2xl shadow-e2" />
          </div>
          <h1 className="text-display font-extrabold tracking-tight text-ink">
            {needsBootstrap ? "Create first manager account" : "Orbit"}
          </h1>
          {needsBootstrap ? (
            <p className="mt-1.5 text-sm text-muted">
              Nobody has signed up yet. This account manages the rest.
            </p>
          ) : null}
        </div>

        {/* The form floats on its own white card, like every other surface. */}
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-card bg-surface p-6 shadow-e2"
        >
          {needsBootstrap ? (
            <>
              <div>
                <label htmlFor="name" className="sr-only">
                  Your name
                </label>
                <input
                  id="name"
                  autoFocus
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="passcode" className="sr-only">
                  Setup passcode
                </label>
                <input
                  id="passcode"
                  type="password"
                  autoComplete="one-time-code"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Setup passcode"
                  className={inputClass}
                />
              </div>
            </>
          ) : null}

          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoFocus={!needsBootstrap}
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={needsBootstrap ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder={needsBootstrap ? "Password (8+ characters)" : "Password"}
              aria-invalid={error !== null}
              aria-describedby={error ? "login-error" : undefined}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={pending || !ready}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-chip bg-primary text-base font-semibold text-on-primary shadow-e1 transition-opacity duration-150 ease-out hover:opacity-95 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? "Checking" : needsBootstrap ? "Create account" : "Sign in"}
          </button>

          <div className="min-h-[1.25rem] text-center" aria-live="polite">
            {error ? (
              <motion.p
                id="login-error"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-danger"
              >
                {error}
              </motion.p>
            ) : null}
          </div>

          {needsBootstrap ? null : (
            <p className="text-center">
              <a href="/forgot" className="text-sm text-muted hover:text-ink hover:underline">
                Forgot password?
              </a>
            </p>
          )}
        </form>
      </motion.div>
    </main>
  );
}
