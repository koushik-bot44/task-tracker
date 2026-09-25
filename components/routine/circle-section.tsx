"use client";

import { Copy, Loader2, Send, Users, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useRoutineMutations } from "@/lib/hooks/use-routine";
import { useToast } from "@/components/toast";
import type { CircleKind, CircleMemberDTO, RoutinePermission } from "@/lib/types";
import { inputCls, Labeled } from "./shared";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The people around the tracked person (2026-09-25) — owner only. A co-parent gets
 * this same Well Being on their own walled login (/family), editable or view-only.
 * A tutor or coach gets one screen (/mentor) to send day reports. Invites go by
 * email, and the link is always shown too, for WhatsApp when the email is slow.
 */
export function CircleSection({ circle, weekParam, personId, personName }: { circle: CircleMemberDTO[]; weekParam: string | null; personId: string | null; personName: string }) {
  const { inviteCircle, updateCircle, removeCircle, resendCircle } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<CircleKind>("FAMILY");
  const [subject, setSubject] = useState("");
  const [permission, setPermission] = useState<RoutinePermission>("EDITABLE");
  const [sendEmail, setSendEmail] = useState(true);
  // The last invite's link (kept until the next invite) + a resent link per member.
  const [invited, setInvited] = useState<{ name: string; url: string; emailSent: boolean } | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  const ready = name.trim().length > 0 && EMAIL.test(email.trim()) && !inviteCircle.isPending;

  const copy = (url: string) => {
    navigator.clipboard?.writeText(url).then(
      () => toast({ message: "Copied" }),
      () => toast({ message: "Couldn't copy — press and hold the link to copy it.", tone: "danger" }),
    );
  };

  const send = () => {
    if (!ready) return;
    inviteCircle.mutate(
      {
        name: name.trim(),
        email: email.trim(),
        kind,
        ...(kind === "MENTOR" && subject.trim() ? { subject: subject.trim() } : {}),
        ...(kind === "FAMILY" ? { permission } : {}),
        sendEmail,
      },
      {
        onSuccess: (r) => {
          toast({ message: "Invited" });
          setInvited({ name: r.member.name, url: r.inviteUrl, emailSent: r.emailSent });
          setName("");
          setEmail("");
          setSubject("");
          setInviting(false);
        },
        onError: err,
      },
    );
  };

  const resend = (m: CircleMemberDTO) => {
    resendCircle.mutate(
      { id: m.id, sendEmail: true },
      {
        onSuccess: (r) => {
          toast({ message: r.emailSent ? `Link sent to ${m.name}` : "Email not sent — share the link yourself." , tone: r.emailSent ? "default" : "danger" });
          setLinks((prev) => ({ ...prev, [m.id]: r.inviteUrl }));
        },
        onError: err,
      },
    );
  };

  const remove = (m: CircleMemberDTO) => {
    if (!window.confirm(`Remove ${m.name}? Their login stops working${m.kind === "MENTOR" ? " and their reports are removed" : ""}.`)) return;
    setLinks((prev) => { const next = { ...prev }; delete next[m.id]; return next; });
    removeCircle.mutate(m.id, { onError: err });
  };

  const kindLabel = (m: CircleMemberDTO) => (m.kind === "FAMILY" ? "Co-parent" : m.subject ? `Tutor or coach · ${m.subject}` : "Tutor or coach");

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Users className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
          <h2 className="min-w-0 truncate font-display text-lg font-semibold pk-fg">People around {personName}</h2>
        </div>
        <button type="button" onClick={() => setInviting((v) => !v)} className={cn("shrink-0 rounded-card px-3 text-sm font-medium", inviting ? "press h-11 pk-fg hover:bg-[color:var(--pk-cell)]" : "press h-11 bg-primary text-on-primary")}>
          {inviting ? "Close" : "Invite"}
        </button>
      </div>
      <p className="mb-4 text-sm pk-fg-soft">A co-parent sees this Well Being. A tutor or coach only sends day reports.</p>

      {inviting ? (
        <div className="mb-4 space-y-3 rounded-card pk-cell p-3">
          <Labeled label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Their name" className={inputCls} />
          </Labeled>
          <Labeled label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoCapitalize="none" aria-label="Their email" className={inputCls} />
          </Labeled>
          <div>
            <span className="pk-fg-soft mb-1 block text-micro font-medium">Who</span>
            <div className="pk-glass inline-flex h-11 max-w-full items-center rounded-card" role="group" aria-label="Who are they">
              {(["FAMILY", "MENTOR"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("pk-press h-11 rounded-card px-3 text-sm font-medium", kind === k ? "pk-tab-active" : "pk-tab pk-tab-hover")}>
                  {k === "FAMILY" ? "Co-parent" : "Tutor or coach"}
                </button>
              ))}
            </div>
          </div>
          {kind === "MENTOR" ? (
            <Labeled label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Maths, Tennis…" aria-label="Subject" className={inputCls} />
            </Labeled>
          ) : (
            <div>
              <span className="pk-fg-soft mb-1 block text-micro font-medium">They can</span>
              <div className="pk-glass inline-flex h-11 max-w-full items-center rounded-card" role="group" aria-label="What they can do">
                {(["EDITABLE", "READ_ONLY"] as const).map((pm) => (
                  <button key={pm} type="button" onClick={() => setPermission(pm)} aria-pressed={permission === pm} className={cn("pk-press h-11 rounded-card px-3 text-sm font-medium", permission === pm ? "pk-tab-active" : "pk-tab pk-tab-hover")}>
                    {pm === "EDITABLE" ? "Can edit" : "View only"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm pk-fg">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-5 w-5 accent-[color:var(--primary)]" />
            Send them the email
          </label>
          <button type="button" onClick={send} disabled={!ready} className="press flex h-11 w-full items-center justify-center gap-2 rounded-card bg-primary text-sm font-medium text-on-primary disabled:opacity-40">
            {inviteCircle.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Send
          </button>
        </div>
      ) : null}

      {invited ? (
        <div className="mb-4 rounded-card pk-cell p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm pk-fg">Their link (send it on WhatsApp if the email doesn&apos;t arrive):</p>
            <button type="button" onClick={() => setInvited(null)} aria-label="Hide the link" className="press -mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)]">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {invited.url ? (
            <>
              <LinkBox url={invited.url} onCopy={() => copy(invited.url)} />
              {invited.emailSent ? null : <p className="mt-2 text-sm font-medium text-warn-ink">Email not sent — share the link yourself.</p>}
            </>
          ) : (
            // The login exists but its link could not be made: Resend on their row makes one (review, 2026-09-25).
            <p className="mt-2 text-sm font-medium text-warn-ink">The link could not be made — tap Resend link on their row to get one.</p>
          )}
        </div>
      ) : null}

      {circle.length === 0 ? (
        <p className="py-3 text-center text-sm pk-fg-soft">Nobody yet. Invite a co-parent, or a tutor or coach.</p>
      ) : (
        <ul className="space-y-2">
          {circle.map((m) => (
            <li key={m.id} className="rounded-card pk-cell px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium pk-fg">{m.name}</p>
                  <p className="truncate text-micro pk-fg-soft">{m.email}</p>
                  <p className="truncate text-micro pk-fg-soft">
                    {kindLabel(m)} · <span className={m.status === "PENDING" ? "text-warn-ink" : "text-ok-ink"}>{m.status === "PENDING" ? "Invited, no password yet" : "Active"}</span>
                  </p>
                </div>
                <button type="button" onClick={() => remove(m)} aria-label={`Remove ${m.name}`} className="press -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {m.kind === "FAMILY" || m.status === "PENDING" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {m.kind === "FAMILY" ? (
                    <button
                      type="button"
                      onClick={() => updateCircle.mutate({ id: m.id, patch: { permission: m.permission === "EDITABLE" ? "READ_ONLY" : "EDITABLE" } }, { onError: err })}
                      aria-pressed={m.permission === "EDITABLE"}
                      title="Tap to switch"
                      className="pk-press pk-btn h-11 shrink-0 rounded-card px-3 text-sm font-medium"
                    >
                      {m.permission === "EDITABLE" ? "Can edit" : "View only"}
                    </button>
                  ) : null}
                  {m.status === "PENDING" ? (
                    <button type="button" onClick={() => resend(m)} disabled={resendCircle.isPending} className="pk-press pk-btn inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card px-3 text-sm font-medium disabled:opacity-40">
                      {resendCircle.isPending && resendCircle.variables?.id === m.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                      Resend link
                    </button>
                  ) : null}
                </div>
              ) : null}
              {links[m.id] ? <LinkBox url={links[m.id]} onCopy={() => copy(links[m.id])} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A link the owner can copy — the input selects itself on tap for a manual copy too. */
function LinkBox({ url, onCopy }: { url: string; onCopy: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" className={cn(inputCls, "min-w-0 flex-1 text-micro")} />
      <button type="button" onClick={onCopy} className="pk-press pk-btn inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card px-3 text-sm font-medium">
        <Copy className="h-4 w-4" aria-hidden /> Copy
      </button>
    </div>
  );
}
