"use client";

import { useEffect, useState, type FormEvent } from "react";
import { InstallAppRow } from "@/components/settings/install-app-row";
import { NotificationsRow } from "@/components/settings/notifications-row";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Face } from "@/components/ui/face";
import { Field, inputClass } from "@/components/ui/sheet";
import { SkeletonCard } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useMyEmailMutations, useMyEmails } from "@/lib/hooks/use-my-account";
import { useMe, useUserMutations } from "@/lib/hooks/use-users";

/** Account: who you are, the address you sign in with, how Orbit reaches you, installing the app, and your password. */
export function AccountPage() {
  const { data: me } = useMe();
  const { changeMyPassword } = useUserMutations();
  const { show: toast } = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Those two don't match.");
      return;
    }
    changeMyPassword.mutate(
      { current, next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setConfirm("");
          toast({ message: "Password changed." });
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4">
      {me ? (
        <Card className="flex items-center gap-3 p-4">
          <Face name={me.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-row font-semibold text-ink">{me.name}</p>
            <p className="truncate text-micro text-muted">
              {me.email}
              {me.departmentName ? ` · ${me.departmentName}` : ""}
            </p>
          </div>
        </Card>
      ) : (
        <SkeletonCard className="h-[4.5rem]" />
      )}

      {me && me.role !== "PERSON" ? <NameCard name={me.name} /> : null}
      {me && me.role !== "PERSON" ? <EmailCard email={me.email} /> : null}
      {me && me.role === "FOUNDER" ? <OtherEmailsCard /> : null}

      <div className="mt-6">
        <NotificationsRow />
      </div>

      <InstallAppRow />

      <section className="mt-6" aria-label="Change password">
        <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-muted">Change password</h2>
        <Card className="p-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Current password">
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Repeat new password">
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
            </Field>
            <Button type="submit" variant="primary" full loading={changeMyPassword.isPending} disabled={!current || !next}>
              Update password
            </Button>
            <div className="min-h-[1.25rem]" aria-live="polite">
              {error ? <p className="text-sm text-danger-ink">{error}</p> : null}
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}

/** The CEO's other sign-in addresses (owner, 2026-10-01): each opens this same
    account with the same password — e.g. a developer's login that is the CEO. */
function OtherEmailsCard() {
  const { data } = useMyEmails(true);
  const { addEmail, removeEmail } = useMyEmailMutations();
  const { show: toast } = useToast();
  const [draft, setDraft] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const next = draft.trim().toLowerCase();

  const add = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!next || !password) return;
    addEmail.mutate(
      { email: next, password },
      {
        onSuccess: () => {
          setDraft("");
          setPassword("");
          toast({ message: `${next} now signs in to this account.` });
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  };
  const remove = (email: string) => {
    if (!window.confirm(`Stop ${email} signing in to this account?`)) return;
    removeEmail.mutate(email, { onError: (err) => setError((err as Error).message) });
  };

  return (
    <section className="mt-6" aria-label="Other sign-in emails">
      <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-muted">Other sign-in emails</h2>
      <Card className="p-4">
        <p className="text-sm text-muted">Each of these opens this same CEO account, with this same password, and sees everything you see.</p>
        {data && data.others.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {data.others.map((email) => (
              <li key={email} className="flex items-center justify-between gap-2 rounded-input border border-line px-3 py-2">
                <span className="min-w-0 truncate text-sm text-ink">{email}</span>
                <button type="button" onClick={() => remove(email)} disabled={removeEmail.isPending} className="press h-9 shrink-0 rounded-input px-2 text-sm text-danger-ink disabled:opacity-40">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={add} className="mt-4 space-y-3">
          <Field label="Add an email">
            <input type="email" inputMode="email" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={320} autoComplete="off" aria-label="Another sign-in email" className={inputClass} />
          </Field>
          {next ? (
            <Field label="Your password" hint="To prove it's you.">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-label="Your password, to add a sign-in email" className={inputClass} />
            </Field>
          ) : null}
          <Button type="submit" variant="secondary" full loading={addEmail.isPending} disabled={!next || !password}>
            Add email
          </Button>
          <div className="min-h-[1.25rem]" aria-live="polite">
            {error ? <p className="text-sm text-danger-ink">{error}</p> : null}
          </div>
        </form>
      </Card>
    </section>
  );
}

/** Your own name, changed as often as you like (owner, 2026-09-10). */
function NameCard({ name }: { name: string }) {
  const { updateMe } = useUserMutations();
  const { show: toast } = useToast();
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const next = draft.trim();
  const dirty = next !== name;

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!next || !dirty) return;
    updateMe.mutate({ name: next }, { onSuccess: () => toast({ message: "Name saved." }), onError: (err) => toast({ message: (err as Error).message, tone: "danger" }) });
  };

  return (
    <section className="mt-6" aria-label="Your name">
      <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-muted">Your name</h2>
      <Card className="p-4">
        <form onSubmit={save} className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} autoComplete="name" aria-label="Your name" className={cn(inputClass, "min-w-0 flex-1")} />
          <Button type="submit" variant="secondary" loading={updateMe.isPending} disabled={!next || !dirty} aria-label="Save your name">
            Save
          </Button>
        </form>
      </Card>
    </section>
  );
}

/**
 * The address you sign in with (2026-09-11), changed by proving your password —
 * the only way the CEO, whom nobody above can edit, moves the account to a new
 * address.
 */
function EmailCard({ email }: { email: string }) {
  const { changeMyEmail } = useUserMutations();
  const { show: toast } = useToast();
  const [draft, setDraft] = useState(email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(email), [email]);
  const next = draft.trim().toLowerCase();
  const dirty = next !== email.toLowerCase();

  const save = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!next || !dirty || !password) return;
    changeMyEmail.mutate(
      { email: next, password },
      {
        onSuccess: () => {
          setPassword("");
          toast({ message: `You now sign in with ${next}.` });
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  };

  return (
    <section className="mt-6" aria-label="Sign-in email">
      <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-muted">Sign-in email</h2>
      <Card className="p-4">
        <form onSubmit={save} className="space-y-3">
          <Field label="Email">
            <input type="email" inputMode="email" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={320} autoComplete="email" aria-label="Sign-in email" className={inputClass} />
          </Field>
          {dirty ? (
            <Field label="Your password" hint="To prove it's you.">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-label="Your password, to change your email" className={inputClass} />
            </Field>
          ) : null}
          <Button type="submit" variant="secondary" full loading={changeMyEmail.isPending} disabled={!next || !dirty || !password}>
            Save email
          </Button>
          <div className="min-h-[1.25rem]" aria-live="polite">
            {error ? <p className="text-sm text-danger-ink">{error}</p> : null}
          </div>
        </form>
      </Card>
    </section>
  );
}
