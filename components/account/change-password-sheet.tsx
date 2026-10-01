"use client";

import { useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Sheet } from "@/components/ui/sheet";
import { useMyPasswordMutations, useMyProfile } from "@/lib/hooks/use-my-account";

/**
 * Change password, from the profile menu every account wears (2026-10-01): with
 * the current password right here, or — forgotten — a reset link to the
 * account's own email (only when this site can send email; it says so otherwise).
 */
export function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: me } = useMyProfile();
  const { changePassword, sendResetLink } = useMyPasswordMutations();
  const { show: toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setLinkSentTo(null);
    onClose();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next.length < 8) return setError("Use at least 8 characters.");
    if (next !== confirm) return setError("Those two don't match.");
    changePassword.mutate(
      { current, next },
      {
        onSuccess: () => {
          toast({ message: "Password changed." });
          close();
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  };

  const emailLink = () =>
    sendResetLink.mutate(undefined, {
      onSuccess: (r) => setLinkSentTo(r.sentTo),
      onError: (err) => setError((err as Error).message),
    });

  return (
    <Sheet open={open} onClose={close} title="Change password" subtitle={me?.email}>
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
        <Button type="submit" variant="primary" full loading={changePassword.isPending} disabled={!current || !next}>
          Update password
        </Button>
        <div className="min-h-[1.25rem]" aria-live="polite">
          {error ? <p className="text-sm text-danger-ink">{error}</p> : null}
        </div>
      </form>

      <div className="mt-2 border-t border-line pt-4">
        <p className="text-sm font-medium text-ink">Forgot your current password?</p>
        {linkSentTo ? (
          <p className="mt-1 text-sm text-ok-ink" role="status">
            A link to set a new one is on its way to {linkSentTo}. It works once, for 72 hours.
          </p>
        ) : me && !me.emailReady ? (
          <p className="mt-1 text-sm text-muted">This site can&apos;t send email yet, so a reset link can&apos;t be mailed.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">We&apos;ll email a link to {me?.email ?? "your address"}.</p>
            <div className="mt-3">
              <Button type="button" variant="secondary" full loading={sendResetLink.isPending} onClick={emailLink}>
                Email me a reset link
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
