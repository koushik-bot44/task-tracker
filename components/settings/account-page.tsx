"use client";

import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { NotificationsRow } from "@/components/settings/notifications-row";
import { RoleChip } from "@/components/role-chip";
import { useToast } from "@/components/toast";
import { useMe, useUserMutations } from "@/lib/hooks/use-users";

const inputClass =
  "h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";

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
      setError("Those two do not match.");
      return;
    }

    changeMyPassword.mutate(
      { current, next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setConfirm("");
          toast({ message: "Password changed" });
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  };

  return (
    <div className="max-w-md px-4 py-4 sm:px-8 sm:py-6">
      {me ? (
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-sm text-ink">
            {me.name}
            <RoleChip role={me.role} />
          </p>
          <p className="mt-0.5 text-micro text-muted">{me.email}</p>
        </div>
      ) : null}

      <NotificationsRow />

      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        <h2 className="text-micro font-medium uppercase tracking-widest text-muted">
          Change password
        </h2>

        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          aria-label="Current password"
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password (8+ characters)"
          aria-label="New password"
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          aria-label="Repeat new password"
          className={inputClass}
        />

        <button
          type="submit"
          disabled={changeMyPassword.isPending || !current || !next}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90 disabled:opacity-40"
        >
          {changeMyPassword.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Update password
        </button>

        <div className="min-h-[1.25rem]" aria-live="polite">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </form>
    </div>
  );
}
