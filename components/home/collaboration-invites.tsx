"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/components/toast";

type Invite = { projectId: string; projectName: string; ownerName: string; invitedAt: string };
const invitesKey = ["collaboration-invites"] as const;

/**
 * A manager's pending collaboration invites (phase 14), shown at the top of
 * their Home. Accept to gain collaborator access to the tool; decline to clear
 * it. Renders nothing when there are none.
 */
export function CollaborationInvites() {
  const qc = useQueryClient();
  const { show: toast } = useToast();

  const { data } = useQuery({
    queryKey: invitesKey,
    queryFn: () => apiGet<Invite[]>("/api/collaboration-invites"),
  });
  const invites = data ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: invitesKey });
    void qc.invalidateQueries({ queryKey: ["projects"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
  };

  const accept = useMutation({
    mutationFn: (projectId: string) => apiPost(`/api/collaboration-invites/${projectId}`, {}),
    onSuccess: () => {
      refresh();
      toast({ message: "You're now collaborating." });
    },
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });
  const decline = useMutation({
    mutationFn: (projectId: string) => apiDelete(`/api/collaboration-invites/${projectId}`),
    onSuccess: refresh,
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });

  if (invites.length === 0) return null;

  return (
    <section className="mb-3 space-y-2">
      {invites.map((inv) => (
        <div
          key={inv.projectId}
          className="card flex flex-wrap items-center gap-x-3 gap-y-2 border-primary-soft bg-primary-soft p-3"
        >
          <p className="min-w-0 flex-1 text-sm text-ink">
            <span className="font-semibold">{inv.ownerName}</span> invited you to collaborate on{" "}
            <span className="font-semibold">{inv.projectName}</span>.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => decline.mutate(inv.projectId)}
              className="press h-8 rounded-card px-3 text-sm text-muted hover:text-ink"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => accept.mutate(inv.projectId)}
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
