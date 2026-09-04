"use client";

import { AlarmClock, Bell, Check, ChevronDown, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useNotifications, useNotificationMutations } from "@/lib/hooks/use-notifications";
import type { NotificationDTO } from "@/lib/types";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/** A Date -> the value a datetime-local input wants (local wall-clock, no tz). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A snoozed-until ISO -> a short friendly local label for the Snoozed section. */
function untilLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The universal notification surface — every role, no push required. Unread
 * badge, a dropdown of the recent items, click-to-navigate-and-read, mark all
 * read, plus per-item SNOOZE (phase 23): a custom date-time each snooze hides
 * the item until then, and a collapsible "Snoozed (N)" section lets the user
 * see and unsnooze early. The snooze picker is INLINE within the dropdown (not
 * a nested floating layer), so it can never clip at a screen edge.
 */
export function NotificationBell() {
  const { data } = useNotifications();
  const { markRead, snooze } = useNotificationMutations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [snoozingId, setSnoozingId] = useState<string | null>(null);
  const [snoozeValue, setSnoozeValue] = useState("");
  const [showSnoozed, setShowSnoozed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];
  const snoozed = data?.snoozed ?? [];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      // While the inline picker is open, ignore outside clicks — a native
      // date-time popup renders outside this node and would otherwise dismiss it.
      if (snoozingId) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, snoozingId]);

  // Reset transient picker state whenever the dropdown closes.
  useEffect(() => {
    if (!open) {
      setSnoozingId(null);
      setShowSnoozed(false);
    }
  }, [open]);

  const onItem = (n: NotificationDTO) => {
    setOpen(false);
    if (!n.readAt) markRead.mutate({ id: n.id });
    router.push(n.url || "/");
  };

  const openPicker = (id: string) => {
    const oneHour = new Date(Date.now() + 60 * 60 * 1000);
    setSnoozeValue(toLocalInput(oneHour));
    setSnoozingId(id);
  };

  const isFuture = snoozeValue !== "" && new Date(snoozeValue).getTime() > Date.now();

  const confirmSnooze = (id: string) => {
    if (!isFuture) return;
    snooze.mutate({ id, until: new Date(snoozeValue).toISOString() });
    setSnoozingId(null);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-lg text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-surface">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed right-3 top-16 z-drawer flex max-h-[70dvh] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-sheet border border-line bg-surface shadow-lift md:absolute md:right-0 md:top-full md:mt-2 md:w-[22rem] md:max-w-none">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markRead.mutate({ all: true })}
                className="press flex items-center gap-1 text-micro font-medium text-primary-ink hover:underline"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <li key={n.id}>
                    <div
                      className={cn(
                        "flex items-start gap-1.5 transition-colors duration-150",
                        !n.readAt && "bg-primary-soft",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onItem(n)}
                        className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left hover:bg-hover"
                      >
                        <span
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            n.readAt ? "bg-transparent" : "bg-primary",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{n.title}</span>
                          <span className="block truncate text-micro text-muted">{n.body}</span>
                          <span className="mt-0.5 block text-[11px] text-muted">{ago(n.createdAt)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => (snoozingId === n.id ? setSnoozingId(null) : openPicker(n.id))}
                        aria-label={`Snooze ${n.title}`}
                        aria-expanded={snoozingId === n.id}
                        className={cn(
                          "press mr-1.5 mt-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-card text-muted hover:bg-hover hover:text-ink",
                          snoozingId === n.id && "bg-hover text-ink",
                        )}
                      >
                        <AlarmClock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </button>
                    </div>

                    {snoozingId === n.id ? (
                      <div className="border-t border-line bg-bg px-3 py-2.5">
                        <label className="mb-1 block text-micro font-medium uppercase tracking-widest text-muted">
                          Snooze until
                        </label>
                        <input
                          type="datetime-local"
                          value={snoozeValue}
                          min={toLocalInput(new Date())}
                          onChange={(e) => setSnoozeValue(e.target.value)}
                          aria-label="Snooze until"
                          className="h-9 w-full rounded-input border border-line bg-surface px-2.5 text-sm text-ink outline-none transition-colors duration-150 ease-out focus:border-primary"
                        />
                        {snoozeValue !== "" && !isFuture ? (
                          <p className="mt-1 text-micro text-danger-ink">Pick a time in the future.</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSnoozingId(null)}
                            className="press h-8 rounded-card px-2.5 text-micro font-medium text-muted hover:text-ink"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmSnooze(n.id)}
                            disabled={!isFuture || snooze.isPending}
                            className="press flex h-8 items-center gap-1.5 rounded-card bg-primary px-2.5 text-micro font-medium text-on-primary disabled:opacity-40"
                          >
                            <AlarmClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                            Snooze
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {snoozed.length > 0 ? (
            <div className="shrink-0 border-t border-line">
              <button
                type="button"
                onClick={() => setShowSnoozed((v) => !v)}
                aria-expanded={showSnoozed}
                className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors duration-150 hover:bg-hover"
              >
                <span className="flex items-center gap-1.5 text-micro font-medium text-muted">
                  <AlarmClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Snoozed ({snoozed.length})
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 text-muted transition-transform duration-150", showSnoozed && "rotate-180")}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              {showSnoozed ? (
                <ul className="max-h-48 divide-y divide-line overflow-y-auto border-t border-line">
                  {snoozed.map((n) => (
                    <li key={n.id} className="flex items-start gap-1.5 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{n.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted">
                          Until {n.snoozedUntil ? untilLabel(n.snoozedUntil) : "—"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => snooze.mutate({ id: n.id, until: null })}
                        disabled={snooze.isPending}
                        className="press flex h-7 shrink-0 items-center gap-1 rounded-card px-2 text-micro font-medium text-primary-ink hover:bg-hover disabled:opacity-40"
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        Unsnooze
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
