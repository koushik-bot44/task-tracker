"use client";

import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";

type Invite = { projectName: string; inviterName: string; pending: boolean } | null;
type Result = "accepted" | "declined" | "already-handled" | "invalid" | "error";

/**
 * The accept/decline surface behind a collaboration-invite email link (phase 18).
 * It only acts on an explicit button press (a POST) — never on load — so an email
 * client or security scanner prefetching the link can't auto-respond. The result
 * comes from the server, which reflects the shared ProjectManager row, so if the
 * invite was already handled in the app this shows "already handled".
 */
export function CollabInviteCard({ token, invite }: { token: string; invite: Invite }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [result, setResult] = useState<Result | null>(
    invite ? (invite.pending ? null : "already-handled") : "invalid",
  );

  const respond = async (action: "accept" | "decline") => {
    setBusy(action);
    try {
      const res = await fetch("/api/collaboration-invites/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const json = (await res.json()) as { status?: Result };
      setResult(json.status ?? "error");
    } catch {
      setResult("error");
    } finally {
      setBusy(null);
    }
  };

  if (result) {
    const messages: Record<Result, { title: string; body: string }> = {
      accepted: {
        title: "Invitation accepted",
        body: `You now collaborate on ${invite?.projectName ?? "the project"}. Open Orbit to get started.`,
      },
      declined: {
        title: "Invitation declined",
        body: "No problem — nothing was shared. You can safely close this tab.",
      },
      "already-handled": {
        title: "Already handled",
        body: "This invitation was already accepted or declined — here or in the app. Nothing more to do.",
      },
      invalid: {
        title: "Link not valid",
        body: "This invitation link is invalid or has expired. Ask the inviter to send a new one.",
      },
      error: {
        title: "Something went wrong",
        body: "Please try again in a moment.",
      },
    };
    const m = messages[result];
    return (
      <div className="rounded-card border border-line bg-surface p-6 text-center shadow-e1">
        <h1 className="font-display text-xl font-semibold text-ink">{m.title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{m.body}</p>
        <a
          href="/"
          className="press mt-5 inline-flex h-10 items-center rounded-card bg-primary px-4 text-sm font-medium text-on-primary"
        >
          Open Orbit
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-e1">
      <h1 className="text-center font-display text-xl font-semibold text-ink">
        {invite!.inviterName} invited you to collaborate
      </h1>
      <p className="mt-2 text-center text-sm text-muted">
        on <span className="font-medium text-ink">{invite!.projectName}</span>
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={busy !== null}
          className="press flex h-11 items-center justify-center gap-1.5 rounded-card bg-primary text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          {busy === "accept" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          )}
          Accept invitation
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={busy !== null}
          className="press flex h-11 items-center justify-center gap-1.5 rounded-card border border-line text-sm font-medium text-ink hover:bg-hover disabled:opacity-50"
        >
          {busy === "decline" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          )}
          Decline
        </button>
      </div>
      <p className="mt-4 text-center text-micro text-muted">
        You can also respond from your Home in Orbit — either way stays in sync.
      </p>
    </div>
  );
}
