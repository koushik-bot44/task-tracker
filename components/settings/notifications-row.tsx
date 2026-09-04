"use client";

import { Bell, Mail, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { usePush } from "@/lib/hooks/use-push";
import { useMe, useUserMutations } from "@/lib/hooks/use-users";
import { isManagerRole } from "@/lib/roles";

const PHONE = /^\+[1-9]\d{6,14}$/;

/**
 * Notifications: three switches — alerts on this device, email, WhatsApp —
 * and the WhatsApp number. Everything degrades quietly: a browser that can't
 * do push shows why and no broken switch. `#notifications` lands here.
 */
export function NotificationsRow() {
  const { data: me } = useMe();
  const { updateMe } = useUserMutations();
  const { permission, subscribed, busy, serverConfigured, enable, disable } = usePush();
  const { show: toast } = useToast();
  const [phone, setPhone] = useState("");
  const [testing, setTesting] = useState(false);

  const savedPhone = me?.phone ?? "";
  useEffect(() => setPhone(savedPhone), [savedPhone]);

  const pushOn = permission === "granted" && subscribed;
  const pushBlocked = permission === "unsupported" || permission === "denied";
  const pushStatus =
    permission === "unsupported"
      ? "Not possible in this browser"
      : permission === "denied"
        ? "Blocked in your browser settings"
        : pushOn
          ? "On for this device"
          : "Off";

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const togglePush = async () => {
    if (pushOn) {
      await disable();
      toast({ message: "Alerts turned off for this device." });
      return;
    }
    const res = await enable();
    if (res.ok) toast({ message: "Alerts are on for this device." });
    else if (res.reason === "denied") toast({ message: "Blocked — turn alerts on in your browser settings.", tone: "danger" });
    else if (res.reason === "server-unconfigured") toast({ message: "Alerts on this device aren't switched on for Orbit yet.", tone: "danger" });
    else if (res.reason !== "default") toast({ message: "Couldn't turn alerts on.", tone: "danger" });
  };

  if (!me) return null;

  const trimmed = phone.trim();
  const valid = trimmed === "" || PHONE.test(trimmed);
  const dirty = trimmed !== savedPhone;

  const savePhone = () => {
    if (!valid || !dirty) return;
    updateMe.mutate(
      { phone: trimmed === "" ? null : trimmed },
      {
        onSuccess: () => toast({ message: trimmed ? "WhatsApp number saved." : "WhatsApp number removed." }),
        onError: fail,
      },
    );
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/whatsapp/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) toast({ message: "Test message sent — check your phone." });
      else toast({ message: body.error ?? "Couldn't send the test.", tone: "danger" });
    } catch {
      toast({ message: "Couldn't send the test.", tone: "danger" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section id="notifications" className="scroll-mt-20" aria-label="Notifications">
      <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-muted">Notifications</h2>
      <Card className="divide-y divide-line">
        <ToggleRow
          icon={<Bell className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="Alerts on this device"
          status={pushStatus}
          on={pushOn}
          disabled={pushBlocked || busy}
          onToggle={() => void togglePush()}
        />
        <ToggleRow
          icon={<Mail className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="Email alerts"
          status={`Meetings and task dates, to ${me.email}`}
          on={me.emailOptIn}
          disabled={updateMe.isPending}
          onToggle={() => updateMe.mutate({ emailOptIn: !me.emailOptIn }, { onError: fail })}
        />
        <ToggleRow
          icon={<MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="WhatsApp alerts"
          status={me.phone ? `Meetings, to ${me.phone}` : "Add your number below"}
          on={me.whatsappOptIn}
          disabled={updateMe.isPending}
          onToggle={() => updateMe.mutate({ whatsappOptIn: !me.whatsappOptIn }, { onError: fail })}
        />
        <div className="px-4 py-4">
          <label htmlFor="wa-phone" className="mb-1.5 block text-micro font-medium text-muted">
            WhatsApp number
          </label>
          <div className="flex flex-wrap gap-2">
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
              placeholder="e.g. +916302608825"
              className={cn(inputClass, "min-w-[10rem] flex-1", !valid && "border-danger")}
            />
            <Button variant="secondary" onClick={savePhone} disabled={!valid || !dirty || updateMe.isPending} loading={updateMe.isPending && dirty}>
              Save
            </Button>
            {isManagerRole(me.role) ? (
              <Button
                variant="secondary"
                onClick={() => void sendTest()}
                disabled={testing || !me.phone || dirty}
                loading={testing}
                title={!me.phone ? "Save a number first" : dirty ? "Save your changes first" : "Send yourself a test message"}
              >
                Send test
              </Button>
            ) : null}
          </div>
          <p className={cn("mt-1.5 text-micro", valid ? "text-muted" : "text-danger-ink")}>
            {valid ? "With the country code, e.g. +916302608825. Leave blank to remove." : "Start with the country code, e.g. +916302608825."}
          </p>
        </div>
      </Card>
      {!serverConfigured && permission !== "unsupported" ? (
        <p className="mt-2 px-1 text-micro text-muted">Alerts on this device aren&apos;t switched on for Orbit yet — the switch will work once they are.</p>
      ) : null}
      <p className="mt-2 px-1 text-micro text-muted">The bell inside Orbit is always on. These reach you when Orbit isn&apos;t open.</p>
    </section>
  );
}

function ToggleRow({
  icon,
  label,
  status,
  on,
  disabled,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[64px] items-center gap-3 px-4 py-3">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", on ? "bg-primary-soft text-primary-ink" : "bg-hover text-muted")} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-row text-ink">{label}</span>
        <span className="block break-words text-micro text-muted">{status}</span>
      </span>
      <Switch on={on} label={label} disabled={disabled} onToggle={onToggle} />
    </div>
  );
}

/** A 44px-tall switch. */
function Switch({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      data-no-press
      className="grid h-11 w-14 shrink-0 place-items-center rounded-full disabled:opacity-40"
    >
      <span className={cn("relative block h-7 w-12 rounded-full transition-colors duration-150 ease-out", on ? "bg-primary" : "bg-guide")}>
        <span
          className={cn(
            "absolute left-0.5 top-0.5 block h-6 w-6 rounded-full bg-surface shadow-e1 transition-transform duration-150 ease-out",
            on ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
