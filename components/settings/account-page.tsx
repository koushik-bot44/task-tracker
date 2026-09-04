"use client";

import { useState, type FormEvent } from "react";
import { NotificationsRow } from "@/components/settings/notifications-row";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Face } from "@/components/ui/face";
import { Field, inputClass } from "@/components/ui/sheet";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useMe, useUserMutations } from "@/lib/hooks/use-users";

/** Account: who you are, how Orbit reaches you, and your password. */
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

      <div className="mt-6">
        <NotificationsRow />
      </div>

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
