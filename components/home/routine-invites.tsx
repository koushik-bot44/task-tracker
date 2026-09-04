"use client";

import { useRoutineInvites } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";

/**
 * A manager's pending ROUTINE invites (phase 39), shown at the top of their Home
 * beside the project collaboration invites. Accept to gain access to that person's
 * routine (read-only or editable per the invite); decline to clear it. Renders
 * nothing when there are none.
 */
export function RoutineInvites() {
  const { invites, accept, decline } = useRoutineInvites();
  const { show: toast } = useToast();
  if (invites.length === 0) return null;

  return (
    <section className="mb-3 space-y-2">
      {invites.map((inv) => (
        <div key={inv.id} className="card flex flex-wrap items-center gap-x-3 gap-y-2 border-primary-soft bg-primary-soft p-3">
          <p className="min-w-0 flex-1 text-sm text-ink">
            <span className="font-semibold">{inv.ownerName}</span> invited you to monitor{" "}
            <span className="font-semibold">{inv.personName}&apos;s</span> Well Being
            {" "}({inv.permission === "EDITABLE" ? "editable" : "read-only"}).
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => decline.mutate(inv.id, { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) })}
              className="press h-8 rounded-card px-3 text-sm text-muted hover:text-ink"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => accept.mutate(inv.id, { onSuccess: () => toast({ message: "You're now monitoring this Well Being." }), onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) })}
              className="press h-8 rounded-card bg-primary px-3 text-sm font-medium text-on-primary"
            >
              Accept
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
