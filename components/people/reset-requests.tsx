"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";

type ResetRow = { id: string; name: string; email: string; requestedAt: string };

/**
 * The admin's queue of "I forgot my password" requests. "Send reset link"
 * emails a set-password link and clears the request; the admin never sees
 * or sets a password. Renders nothing when the queue is empty.
 */
export function ResetRequestQueue({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const key = ["password-reset-requests"] as const;

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => apiGet<ResetRow[]>("/api/password-reset"),
  });
  const rows = data ?? [];

  const resolve = useMutation({
    mutationFn: (id: string) => apiPost<{ ok: true; emailSent: boolean }>(`/api/password-reset/${id}/resolve`, {}),
    onSuccess: ({ emailSent }) => {
      void qc.invalidateQueries({ queryKey: key });
      toast({
        message: emailSent ? "Reset link sent." : "Cleared, but the email didn't send.",
        tone: emailSent ? undefined : "danger",
      });
    },
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });

  if (rows.length === 0) return null;

  return (
    <section className={cn("rounded-card bg-warn-soft p-4", className)}>
      <h2 className="text-micro font-semibold uppercase tracking-wider text-warn-ink">Password reset requests</h2>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-surface px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-row text-ink">{r.name}</p>
              <p className="truncate text-micro text-muted">
                {r.email} · asked {dateWord(r.requestedAt).toLowerCase()}
              </p>
            </div>
            <Button variant="secondary" onClick={() => resolve.mutate(r.id)} disabled={resolve.isPending} loading={resolve.isPending && resolve.variables === r.id}>
              Send reset link
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
