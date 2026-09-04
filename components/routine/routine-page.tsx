"use client";

import { Bell, ChevronLeft, ChevronRight, Eye, Loader2, Maximize2, Minimize2, Pencil, Plus, ShieldCheck, Sparkles, Sun, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { isManagerRole } from "@/lib/roles";
import { useMe } from "@/lib/hooks/use-users";
import { useRoutine, useRoutineMutations } from "@/lib/hooks/use-routine";
import { useUsers } from "@/lib/hooks/use-users";
import { useTimeScene } from "@/lib/hooks/use-time-scene";
import { useToast } from "@/components/toast";
import type { RoutineCollaboratorDTO, RoutineOverviewDTO, RoutinePermission } from "@/lib/types";
import { WellBeingScene } from "./well-being-scene";
import { WeeklyGrid } from "./weekly-grid";
import { NonNegotiables } from "./non-negotiables";
import { TasksSection } from "./tasks-section";
import { WeightMonitor } from "./weight-monitor";
import { SummaryView } from "./summary-view";
import { addDays, inputCls, Labeled, weekLabel } from "./shared";

/**
 * The Well Being tab (was "Routine", phase 35) — MANAGER only. A calm family corner
 * for ONE tracked person: a segmented weekly habit grid, non-negotiables, tasks, and a
 * weight monitor. Phase 46: it gets the SAME immersive treatment as the person /kid
 * screen — the shared time-based 3D scene (`WellBeingScene` + `useTimeScene`) as the
 * PAGE CONTENT background (scoped inside the app chrome — not the sidebar/header, not
 * other tabs) and frosted-glass panels (the shared `.pk-*` classes) for every surface,
 * text adapting dark/light by scene. Styling only — all Well Being logic is unchanged.
 */
export function RoutinePage() {
  const router = useRouter();
  const { data: me } = useMe();
  // null = the current week (server picks); a Monday key = a specific week.
  const [week, setWeek] = useState<string | null>(null);
  // null = the caller's default routine (own person, else first collaboration).
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const { data, isLoading } = useRoutine(week, selectedPerson, isManagerRole(me?.role));
  // Shared scene (same source as the person screen). The scene class (pk-day / pk-night)
  // on this page root supplies the glass CSS vars to every .pk-* descendant.
  const { mounted, night, overNight, floatText } = useTimeScene();
  const sceneClass = overNight ? "pk-night" : "pk-day";

  // Full-screen: the manager can send just the Well Being scene edge-to-edge (browser
  // Fullscreen API on this page root — the sidebar/header drop away, only the scene fills).
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const sync = () => setIsFs(Boolean(document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); document.removeEventListener("webkitfullscreenchange", sync); };
  }, []);
  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    const doc = document as unknown as { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
    if (active) {
      (document.exitFullscreen?.() as Promise<void> | undefined ?? Promise.resolve()).catch(() => {});
      doc.webkitExitFullscreen?.();
    } else {
      const req = el.requestFullscreen?.() ?? (el as unknown as { webkitRequestFullscreen?: () => Promise<void> | void }).webkitRequestFullscreen?.();
      (req as Promise<void> | undefined)?.catch?.(() => {});
    }
  };

  // Courtesy client guard; the API + middleware are the real authority.
  useEffect(() => {
    if (me && !isManagerRole(me.role)) router.replace("/");
  }, [me, router]);

  if (!me || !isManagerRole(me.role)) return null;

  return (
    // The scene fills the Well Being page content region only (absolute within this
    // relative root — the sidebar/header + other tabs keep their normal light look).
    <div ref={rootRef} className={cn("wb-fs relative min-h-[calc(100dvh-4rem)]", sceneClass)}>
      <div aria-hidden className="wb-scene wb-scene-app">
        {mounted ? <WellBeingScene night={night} /> : null}
      </div>
      {/* z-[1] sits above the z-0 scene but BELOW the app header (z-sticky = 10), so the
          content slides cleanly under the chrome instead of painting over it when scrolled. */}
      <div className="relative z-[1] px-4 py-4 pb-32 sm:px-8 sm:py-6">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className={cn("flex items-center gap-2 font-display text-page-lg font-bold", floatText)}>
              <Sun className={cn("h-6 w-6", overNight ? "text-warn" : "text-warn-ink")} strokeWidth={2} aria-hidden />
              Well Being
            </h1>
            <p className={cn("mt-1 text-sm", overNight ? "text-on-primary" : "pk-fg")}>A calm place to track a person&apos;s week — yours or one you help monitor.</p>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-pressed={isFs}
            aria-label={isFs ? "Exit full screen" : "Enter full screen"}
            title={isFs ? "Exit full screen" : "Full screen"}
            className="pk-press pk-btn pk-glass pk-fg inline-flex shrink-0 items-center gap-1.5 rounded-card px-3 py-2 text-micro font-medium"
          >
            {isFs ? <Minimize2 className="h-4 w-4" strokeWidth={2} aria-hidden /> : <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden />}
            <span className="hidden sm:inline">{isFs ? "Exit full screen" : "Full screen"}</span>
          </button>
        </header>

        {isLoading || !data ? (
          <div className={cn("py-16 text-center text-sm", overNight ? "text-on-primary" : "pk-fg-soft")}>Loading…</div>
        ) : data.person ? (
          <RoutineDashboard data={data} week={week} setWeek={setWeek} selectedPerson={selectedPerson} setSelectedPerson={setSelectedPerson} />
        ) : (
          <AddPerson />
        )}
      </div>
    </div>
  );
}

function AddPerson() {
  const { createPerson } = useRoutineMutations(null, null);
  const { show: toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const ready = name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && password.length >= 6 && !createPerson.isPending;

  const submit = () => {
    if (!ready) return;
    createPerson.mutate({ name: name.trim(), email: email.trim(), password }, { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) });
  };

  return (
    <div className="max-w-xl rounded-sheet pk-glass p-6 sm:p-8">
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary-ink">
          <Sparkles className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="font-display text-xl pk-fg">Add a person</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm pk-fg-soft">
          Create a gentle login just for them. You&apos;ll set up the weekly grid and tasks; they simply tick off what they&apos;ve done.
        </p>
      </div>
      <div className="mx-auto max-w-sm space-y-3">
        <Labeled label="Their name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav" aria-label="Person's name" className={inputCls} />
        </Labeled>
        <Labeled label="Login email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their-login@home" type="email" aria-label="Login email" className={inputCls} />
        </Labeled>
        <Labeled label="Password (you set this, then tell them)">
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 6 characters" type="text" aria-label="Password" className={inputCls} />
        </Labeled>
        <button type="button" onClick={submit} disabled={!ready} className="press flex h-11 w-full items-center justify-center gap-2 rounded-card bg-primary text-sm font-medium text-on-primary disabled:opacity-40">
          {createPerson.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Add person
        </button>
      </div>
    </div>
  );
}

function RoutineDashboard({
  data,
  week,
  setWeek,
  selectedPerson,
  setSelectedPerson,
}: {
  data: RoutineOverviewDTO;
  week: string | null;
  setWeek: (w: string | null) => void;
  selectedPerson: string | null;
  setSelectedPerson: (id: string | null) => void;
}) {
  const { today, person, week: weekMeta, segments, nonNegotiables, tasks, weights, monthlyWeights, summary, role, routines, collaborators } = data;
  // The RESOLVED id — for the switcher highlight only.
  const personId = person!.id;
  // The routine IDENTITY the query is keyed by (null = the caller's default routine).
  // Every write MUST key on the SAME value the query used, or its optimistic update
  // and cache invalidation land on a different key and the UI only refreshes on reload.
  const routineId = selectedPerson;
  const readOnly = role === "READ_ONLY";
  const canWrite = role === "OWNER" || role === "EDITABLE";
  const isOwner = role === "OWNER";
  const isCurrent = weekMeta.weekStart === weekStartOf(today);
  // Summary (the calm overview) is the default first view; Tracker (the grid the
  // manager marks in) is one tap away. The week selector is SHARED.
  const [view, setView] = useState<"summary" | "tracker">("summary");
  const label = isCurrent ? "This week" : weekLabel(weekMeta.days);
  const undoneToday = tasks.filter((t) => !t.done && (t.dueDate === null || t.dueDate === today)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="pk-glass inline-flex rounded-card p-1" role="tablist" aria-label="Well Being view">
          {(["summary", "tracker"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("pk-press rounded-card px-4 py-1.5 text-sm font-medium capitalize", view === v ? "pk-tab-active" : "pk-tab pk-tab-hover")}
            >
              {v}
            </button>
          ))}
        </div>
        {routines.length > 1 ? <RoutineSwitcher routines={routines} selectedId={personId} onSelect={setSelectedPerson} /> : null}
        {readOnly ? (
          <span className="pk-glass pk-fg inline-flex items-center gap-1.5 rounded-card px-2.5 py-1 text-micro font-medium">
            <Eye className="h-3.5 w-3.5" aria-hidden /> Read-only
          </span>
        ) : null}
      </div>

      <PersonBar person={person!} weekParam={week} personId={routineId} isOwner={isOwner} />
      <WeekNav
        label={label}
        sub={isCurrent ? weekLabel(weekMeta.days) : ""}
        onPrev={() => setWeek(addDays(weekMeta.weekStart, -7))}
        onNext={() => setWeek(addDays(weekMeta.weekStart, 7))}
        onToday={isCurrent ? null : () => setWeek(null)}
      />

      {view === "summary" ? (
        <SummaryView summary={summary} weekLabel={label} />
      ) : (
        // On wide screens the sections flow into two columns so the tab fills the space.
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <div className="space-y-5">
            <WeeklyGrid segments={segments} week={weekMeta} weekParam={week} personId={routineId} today={today} readOnly={readOnly} />
            <NonNegotiables items={nonNegotiables} week={weekMeta} weekParam={week} personId={routineId} today={today} readOnly={readOnly} />
          </div>
          <div className="space-y-5">
            <TasksSection tasks={tasks} today={today} weekParam={week} personId={routineId} readOnly={readOnly} />
            {canWrite ? <ReminderCard week={week} personId={routineId} undoneToday={undoneToday} /> : null}
            <WeightMonitor entries={weights} monthly={monthlyWeights} today={today} weekParam={week} personId={routineId} readOnly={readOnly} />
          </div>
        </div>
      )}

      {isOwner ? <MonitoringManagers collaborators={collaborators} week={week} personId={routineId} /> : null}
    </div>
  );
}

/** Switch between the routines the manager can open (own + accepted collaborations). */
function RoutineSwitcher({ routines, selectedId, onSelect }: { routines: RoutineOverviewDTO["routines"]; selectedId: string; onSelect: (id: string | null) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-micro pk-fg-soft">
      <Users className="h-4 w-4" aria-hidden />
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="Choose a Well Being"
        className="h-9 rounded-card pk-glass px-2 text-sm pk-fg outline-none focus:border-primary"
      >
        {routines.map((r) => (
          <option key={r.personId} value={r.personId}>
            {r.name}{r.role === "OWNER" ? "" : r.role === "EDITABLE" ? " (editable)" : " (read-only)"}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Owner-only: invite / list / change-permission / revoke monitoring managers. */
function MonitoringManagers({ collaborators, week, personId }: { collaborators: RoutineCollaboratorDTO[]; week: string | null; personId: string | null }) {
  const { data: me } = useMe();
  const { data: users } = useUsers();
  const { inviteCollaborator, updateCollaborator, revokeCollaborator } = useRoutineMutations(week, personId);
  const { show: toast } = useToast();
  const [inviteeId, setInviteeId] = useState("");
  const [permission, setPermission] = useState<RoutinePermission>("READ_ONLY");
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const taken = new Set(collaborators.map((c) => c.managerId));
  // Only the CEO has Well Being now, so there is nobody else to invite; kept for the day that changes.
  const candidates = (users ?? []).filter((u) => u.role === "FOUNDER" && u.id !== me?.id && !taken.has(u.id));

  const invite = () => {
    if (!inviteeId) return;
    inviteCollaborator.mutate({ managerId: inviteeId, permission }, { onSuccess: () => { setInviteeId(""); toast({ message: "Invited" }); }, onError: err });
  };

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 pk-fg-soft" strokeWidth={2} aria-hidden />
        <h2 className="font-display text-lg font-semibold pk-fg">Monitoring managers</h2>
      </div>
      <p className="mb-4 text-micro pk-fg-soft">Invite another manager to view — or help manage — this Well Being.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={inviteeId} onChange={(e) => setInviteeId(e.target.value)} aria-label="Manager to invite" className={cn(inputCls, "h-10 min-w-0 flex-1")}>
          <option value="">Invite a manager…</option>
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
          ))}
        </select>
        <div className="pk-glass inline-flex shrink-0 rounded-card p-1">
          {(["READ_ONLY", "EDITABLE"] as const).map((pm) => (
            <button key={pm} type="button" onClick={() => setPermission(pm)} aria-pressed={permission === pm} className={cn("pk-press rounded-card px-3 py-1.5 text-micro font-medium", permission === pm ? "pk-tab-active" : "pk-tab pk-tab-hover")}>
              {pm === "READ_ONLY" ? "Read-only" : "Editable"}
            </button>
          ))}
        </div>
        <button type="button" onClick={invite} disabled={!inviteeId || inviteCollaborator.isPending} aria-label="Send invite" className="press grid h-10 w-10 shrink-0 place-items-center rounded-card bg-primary text-on-primary disabled:opacity-40">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {collaborators.length === 0 ? (
        <p className="py-3 text-center text-sm pk-fg-soft">No monitoring managers yet.</p>
      ) : (
        <ul className="space-y-2">
          {collaborators.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium pk-fg">{c.managerName}</p>
                <p className="truncate text-micro pk-fg-soft">{c.managerEmail} · {c.status === "PENDING" ? "Invited" : "Monitoring"}</p>
              </div>
              <button
                type="button"
                onClick={() => updateCollaborator.mutate({ id: c.id, permission: c.permission === "EDITABLE" ? "READ_ONLY" : "EDITABLE" }, { onError: err })}
                className="pk-press pk-btn shrink-0 rounded-card px-2.5 py-1 text-micro font-medium"
                title="Toggle read-only / editable"
              >
                {c.permission === "EDITABLE" ? "Editable" : "Read-only"}
              </button>
              <button type="button" onClick={() => { if (window.confirm(`Remove ${c.managerName} from this Well Being?`)) revokeCollaborator.mutate(c.id, { onError: err }); }} aria-label={`Remove ${c.managerName}`} className="press grid h-7 w-7 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Owner/editable: nudge the person about undone tasks (push + in-app). Only
    enabled when there ARE pending tasks; rate-limited on the server. */
function ReminderCard({ week, personId, undoneToday }: { week: string | null; personId: string | null; undoneToday: number }) {
  const { sendReminder } = useRoutineMutations(week, personId);
  const { show: toast } = useToast();
  const send = () => {
    sendReminder.mutate(undefined, {
      onSuccess: (r) => {
        if (r.sent) toast({ message: `Reminder sent — ${r.count} task${r.count === 1 ? "" : "s"}` });
        else if (r.reason === "none") toast({ message: "No pending tasks — nothing to remind." });
        else toast({ message: "Just reminded — try again in a few minutes.", tone: "danger" });
      },
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };
  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold pk-fg">Reminder</h2>
          <p className="mt-0.5 text-micro pk-fg-soft">
            {undoneToday > 0 ? `${undoneToday} task${undoneToday === 1 ? "" : "s"} still to do today` : "All today's tasks are done"}
          </p>
        </div>
        <button
          type="button"
          onClick={send}
          disabled={undoneToday === 0 || sendReminder.isPending}
          className="press inline-flex h-10 shrink-0 items-center gap-2 rounded-card bg-primary px-4 text-sm font-medium text-on-primary disabled:opacity-40"
        >
          <Bell className="h-4 w-4" aria-hidden /> Send reminder
        </button>
      </div>
    </section>
  );
}

function WeekNav({ label, sub, onPrev, onNext, onToday }: { label: string; sub: string; onPrev: () => void; onNext: () => void; onToday: (() => void) | null }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-card pk-glass px-2 py-1.5">
      <button type="button" onClick={onPrev} aria-label="Previous week" className="press grid h-9 w-9 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:pk-fg">
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <div className="min-w-0 text-center">
        <p className="truncate text-sm font-semibold pk-fg">{label}</p>
        {sub ? <p className="truncate text-micro pk-fg-soft">{sub}</p> : null}
        {onToday ? (
          <button type="button" onClick={onToday} className="press text-micro font-medium text-primary-ink hover:underline">Jump to this week</button>
        ) : null}
      </div>
      <button type="button" onClick={onNext} aria-label="Next week" className="press grid h-9 w-9 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:pk-fg">
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

function PersonBar({ person, weekParam, personId, isOwner }: { person: NonNullable<RoutineOverviewDTO["person"]>; weekParam: string | null; personId: string | null; isOwner: boolean }) {
  const { updatePerson, deletePerson } = useRoutineMutations(weekParam, personId);
  const { show: toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [email, setEmail] = useState(person.loginEmail);
  const [pw, setPw] = useState("");

  const save = () => {
    const patch: { name?: string; email?: string; password?: string } = {};
    if (name.trim() && name.trim() !== person.name) patch.name = name.trim();
    if (email.trim() && email.trim().toLowerCase() !== person.loginEmail.toLowerCase()) patch.email = email.trim();
    if (pw.length >= 6) patch.password = pw;
    if (Object.keys(patch).length === 0) return setEditing(false);
    updatePerson.mutate(patch, {
      onSuccess: () => { toast({ message: "Saved" }); setPw(""); setEditing(false); },
      onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
    });
  };
  const remove = () => {
    if (!window.confirm(`Remove ${person.name}? This deletes their login and ALL Well Being history — habits, marks, non-negotiables, weight and tasks. This can't be undone.`)) return;
    deletePerson.mutate(undefined, { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) });
  };

  return (
    <div className="rounded-card pk-glass p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok-soft font-display text-base font-semibold text-ok-ink">
          {person.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold pk-fg">{person.name}</p>
          <p className="truncate text-micro pk-fg-soft">Login: {person.loginEmail}</p>
        </div>
        {isOwner ? (
          <>
            <button type="button" onClick={() => { setName(person.name); setEmail(person.loginEmail); setEditing((v) => !v); }} aria-label="Edit person" className="press grid h-8 w-8 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:pk-fg">
              <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <button type="button" onClick={remove} aria-label="Remove person" className="press grid h-8 w-8 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
              <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </>
        ) : null}
      </div>
      {editing && isOwner ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <Labeled label="Name"><input value={name} onChange={(e) => setName(e.target.value)} aria-label="Person name" className={inputCls} /></Labeled>
          <Labeled label="Login email"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" aria-label="Person login email" className={inputCls} /></Labeled>
          <Labeled label="Reset password (leave blank to keep)"><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="new password" aria-label="New password" className={inputCls} /></Labeled>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="press h-9 rounded-card px-3 text-sm pk-fg-soft hover:pk-fg">Cancel</button>
            <button type="button" onClick={save} disabled={updatePerson.isPending} className="press h-9 rounded-card bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-40">Save</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Monday (IST week start) of a day key — mirrors the server's weekStartKey. */
function weekStartOf(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00.000Z`);
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
