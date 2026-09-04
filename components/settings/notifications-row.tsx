"use client";

import { Bell, Loader2, Mail, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { usePush } from "@/lib/hooks/use-push";
import { useMe, useUserMutations } from "@/lib/hooks/use-users";

/**
 * The Settings/account "Notifications" row: current status for this device and
 * an enable/turn-off control. Everything degrades quietly: an unsupported or
 * blocked browser shows the state and no broken buttons.
 */
export function NotificationsRow() {
  const { permission, subscribed, busy, serverConfigured, enable, disable } = usePush();
  const { show: toast } = useToast();

  const on = permission === "granted" && subscribed;
  const status =
    permission === "unsupported"
      ? "Not supported in this browser"
      : permission === "denied"
        ? "Blocked in your browser settings"
        : on
          ? "On for this device"
          : "Off";

  const onEnable = async () => {
    const res = await enable();
    if (res.ok) toast({ message: "Notifications enabled." });
    else if (res.reason === "denied")
      toast({ message: "Blocked — turn notifications on in your browser settings.", tone: "danger" });
    else if (res.reason === "server-unconfigured")
      toast({ message: "Push isn't configured on the server yet.", tone: "danger" });
    else if (res.reason !== "default")
      toast({ message: "Couldn't enable notifications.", tone: "danger" });
  };

  const onDisable = async () => {
    await disable();
    toast({ message: "Notifications turned off for this device." });
  };

  return (
    <section className="mt-5">
      <h2 className="mb-2 text-micro font-medium uppercase tracking-widest text-muted">
        Notifications
      </h2>
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={cnStatus(on)}
            aria-hidden
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">Alerts on this device</p>
            <p className={`text-micro ${on ? "text-ok-ink" : "text-muted"}`}>{status}</p>
          </div>

          {permission === "unsupported" || permission === "denied" ? null : on ? (
            <button
              type="button"
              onClick={onDisable}
              disabled={busy}
              className="press flex h-9 items-center rounded-card px-3 text-sm text-muted hover:text-ink disabled:opacity-50"
            >
              Turn off
            </button>
          ) : (
            <button
              type="button"
              onClick={onEnable}
              disabled={busy}
              className="press flex h-9 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Enable
            </button>
          )}
        </div>

        {!serverConfigured && permission !== "unsupported" ? (
          <p className="mt-3 text-micro text-muted">
            Push isn&apos;t switched on for Orbit yet — this will start working once it is.
          </p>
        ) : null}
      </div>

      <EmailAlerts />

      <WhatsAppAlerts />

      <p className="mt-2 px-1 text-micro text-muted">
        The in-app bell is always on for everyone. Push, email, and WhatsApp are the
        optional layers that reach you when Orbit isn&apos;t open — each is separate.
      </p>
    </section>
  );
}

/** Email opt-out — covers both meeting and task-due emails. */
function EmailAlerts() {
  const { data: me } = useMe();
  const { updateMe } = useUserMutations();
  const { show: toast } = useToast();
  if (!me) return null;
  const on = me.emailOptIn;

  const toggle = () => {
    updateMe.mutate(
      { emailOptIn: !on },
      { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) },
    );
  };

  return (
    <div className="mt-3 rounded-card border border-line bg-surface p-4">
      {/* Top line owns the label and the toggle; the long address and the test
          button never compete with them for the same row. */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-card",
            on ? "bg-primary-soft text-primary-ink" : "bg-hover text-muted",
          )}
          aria-hidden
        >
          <Mail className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">Email alerts</p>
          <p className="text-micro text-muted">
            Meeting and task-due emails to <span className="break-all">{me.email}</span>. Push and
            the in-app bell are separate.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Email alerts"
          onClick={toggle}
          disabled={updateMe.isPending}
          className={cn(
            // inline-flex + items-center keeps the knob a normal in-flow child so
            // its base offset is a deterministic 0; an absolute knob resolved its
            // static position to ~half the track and the on-state translate then
            // carried it clean out the right side.
            "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ease-out disabled:opacity-50",
            on ? "bg-primary" : "bg-line",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-surface shadow-e1 transition-transform duration-150 ease-out",
              on ? "translate-x-[1.375rem]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
    </div>
  );
}

/**
 * WhatsApp opt-in (phase 32): a per-person number + a channel toggle. Separate
 * from email/push/bell. Managers also get a "Send test" that pings their own
 * number via /api/whatsapp/test, so the sandbox is verifiable without a meeting.
 */
function WhatsAppAlerts() {
  const { data: me } = useMe();
  const { updateMe } = useUserMutations();
  const { show: toast } = useToast();
  const [phone, setPhone] = useState("");
  const [testing, setTesting] = useState(false);

  // Seed the field from the saved number whenever it changes underneath us.
  useEffect(() => {
    if (me) setPhone(me.phone ?? "");
  }, [me?.phone]);

  if (!me) return null;
  const on = me.whatsappOptIn;
  const trimmed = phone.trim();
  const valid = trimmed === "" || /^\+[1-9]\d{6,14}$/.test(trimmed);
  const dirty = trimmed !== (me.phone ?? "");

  const savePhone = () => {
    if (!valid || !dirty) return;
    updateMe.mutate(
      { phone: trimmed === "" ? null : trimmed },
      {
        onSuccess: () => toast({ message: trimmed ? "WhatsApp number saved." : "WhatsApp number removed." }),
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  const toggle = () => {
    updateMe.mutate(
      { whatsappOptIn: !on },
      { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) },
    );
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/whatsapp/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) toast({ message: "Test WhatsApp sent — check your phone." });
      else toast({ message: body.error ?? "Couldn't send the test.", tone: "danger" });
    } catch {
      toast({ message: "Couldn't send the test.", tone: "danger" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-card",
            on ? "bg-primary-soft text-primary-ink" : "bg-hover text-muted",
          )}
          aria-hidden
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">WhatsApp alerts</p>
          <p className="text-micro text-muted">
            Meeting notifications over WhatsApp. A separate channel — turning it off
            doesn&apos;t affect email, push, or the bell.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="WhatsApp alerts"
          onClick={toggle}
          disabled={updateMe.isPending}
          className={cn(
            "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ease-out disabled:opacity-50",
            on ? "bg-primary" : "bg-line",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-surface shadow-e1 transition-transform duration-150 ease-out",
              on ? "translate-x-[1.375rem]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      <div className="mt-3">
        <label
          htmlFor="wa-phone"
          className="mb-1 block text-micro font-medium uppercase tracking-widest text-muted"
        >
          WhatsApp number
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="wa-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                savePhone();
              }
            }}
            inputMode="tel"
            placeholder="+countrycode…  e.g. +916302608825"
            aria-label="WhatsApp number"
            className={cn(
              "h-9 min-w-0 flex-1 rounded-input border bg-bg px-2.5 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary",
              valid ? "border-line" : "border-danger",
            )}
          />
          <button
            type="button"
            onClick={savePhone}
            disabled={!valid || !dirty || updateMe.isPending}
            className="press h-9 shrink-0 rounded-card bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-40"
          >
            Save
          </button>
          {me.role === "MANAGER" ? (
            <button
              type="button"
              onClick={sendTest}
              disabled={testing || !me.phone || dirty}
              title={!me.phone ? "Save a number first" : dirty ? "Save your changes first" : "Send yourself a test WhatsApp"}
              className="press flex h-9 shrink-0 items-center gap-1.5 rounded-card border border-line px-3 text-sm text-ink hover:bg-hover disabled:opacity-40"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Send test
            </button>
          ) : null}
        </div>
        <p className={cn("mt-1 text-micro", valid ? "text-muted" : "text-danger-ink")}>
          {valid
            ? "International format, e.g. +916302608825. Leave blank to remove."
            : "Use international format, e.g. +916302608825."}
        </p>
      </div>
    </div>
  );
}

function cnStatus(on: boolean): string {
  return [
    "grid h-9 w-9 shrink-0 place-items-center rounded-card",
    on ? "bg-primary-soft text-primary-ink" : "bg-hover text-muted",
  ].join(" ");
}
