"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Someone's set-password link, to hand over by hand. */
export type InviteLink = { name: string; email: string; url: string; phone?: string | null };

/** The words that go with a link. */
export function inviteMessage(link: InviteLink, project?: string | null): string {
  const first = link.name.trim().split(/\s+/)[0] || "there";
  return `Hi ${first}, you're invited to Orbit${project ? ` to work on ${project}` : ""}. Set your password here: ${link.url} (the link works once, for 3 days)`;
}

/** WhatsApp with the message already written — straight to their chat when their number is known. */
export function whatsappHref(link: InviteLink, project?: string | null): string {
  const digits = (link.phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(inviteMessage(link, project))}`;
}

const action = "press inline-flex h-10 items-center justify-center gap-1.5 rounded-input px-3 text-sm font-semibold";

/**
 * The invite links just made (owner, 2026-09-10). An email can land in spam, so
 * each set-password link can go on WhatsApp or be copied and sent any other way.
 * A link works once, for 3 days; making a new one ends the old.
 */
export function InviteLinks({ links, project, className }: { links: InviteLink[]; project?: string | null; className?: string }) {
  if (!links.length) return null;
  const several = links.length > 1;
  return (
    <section aria-label={several ? "Invite links" : "Invite link"} className={cn("space-y-2 rounded-input border border-line bg-surface p-3", className)}>
      <div>
        <h3 className="text-sm font-semibold text-ink">{several ? "Send them their invite links" : "Send them their invite link"}</h3>
        <p className="text-micro text-muted">On WhatsApp, or copy it — an email can land in spam. A link works once, for 3 days.</p>
      </div>
      <ul className="divide-y divide-line">
        {links.map((link) => (
          <LinkRow key={link.url} link={link} project={project} />
        ))}
      </ul>
    </section>
  );
}

function LinkRow({ link, project }: { link: InviteLink; project?: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the link is on screen to select */
    }
  };
  return (
    <li className="space-y-1.5 py-2 first:pt-1 last:pb-0">
      <p className="truncate text-sm text-ink">
        {link.name} <span className="text-micro text-muted">· {link.email}</span>
      </p>
      <input
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`Invite link for ${link.name}`}
        className="h-9 w-full rounded-input border border-line bg-bg px-2 font-mono text-[12px] text-ink outline-none focus:border-primary"
      />
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappHref(link, project)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Send ${link.name}'s invite on WhatsApp`}
          className={cn(action, "bg-ok-soft text-ok-ink")}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
          Send on WhatsApp
        </a>
        <button type="button" onClick={() => void copy()} aria-label={`Copy ${link.name}'s invite link`} className={cn(action, "bg-hover text-ink")}>
          {copied ? <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </li>
  );
}
