"use client";

import { Bell, CalendarDays, Check, ListChecks, Loader2, LogOut, MapPin, Plus, ShieldCheck, Star, Sun, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ApiError, apiDelete } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import { usePerson, usePersonAddTask, usePersonCalendar, usePersonDeleteTask, usePersonHabitMark, usePersonLocationDay, usePersonTaskToggle, useWho } from "@/lib/hooks/use-routine";
import { useTimeScene } from "@/lib/hooks/use-time-scene";
import type { LocationPointDTO, MentorReportDTO, PersonViewDTO, RoutineTaskDTO } from "@/lib/types";
import { WellBeingScene } from "./well-being-scene";
import { SegmentGrid } from "./weekly-grid";
import { PersonMoney } from "./person-money";
import { CalendarView, monthOf } from "./calendar-view";
import { CheckInCard } from "./checkin-card";
import { LocationMapLazy } from "./location-map-lazy";
import { inputCls, prettyDate, weekdayInitial } from "./shared";

/**
 * The PERSON's whole app — one calm, friendly screen in TABS (Today / Habits /
 * Rules / Calendar / Money / Map). A PERSON reaches nothing else (middleware confines
 * them to the family area + /api/routine; every work API 403s them). They write only
 * their own habit marks, task checks, the `done` flag on scheduled rule days, their
 * OWN extras for the day, their OWN pocket-money lines and their own check-ins —
 * never the schedule itself.
 *
 * Phase 44–46: a code-rendered soft-3D scene (`WellBeingScene`) sits behind
 * everything and the working UI is FROSTED GLASS over it (shared with the
 * manager's Well Being tab). 2026-09-25 — the circle: the Today tab splits the
 * list into "For you" (parent-set) and "Your own" (the person's extras, removable,
 * with one add line), shows the tutors' reports, and a Money tab keeps the month's
 * pocket money by hand. Later that day: a "Where are you?" card on Today, a month
 * Calendar of his own days, and a Map of today's check-ins that also says whether
 * his phone is sharing its position with his parents — his view, for transparency.
 * Six pills no longer fit one row on a 390px phone, so the tab bar slides sideways
 * and the active pill scrolls itself into view.
 */
type TabId = "today" | "habits" | "rules" | "calendar" | "money" | "map";

/** "8:12 am" in IST — a clock reading of an instant, not a day key. */
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Which walled login is this? The PERSON role covers three people: the son stays
 * here, a co-parent goes to /family, a tutor to /mentor. A 401/403 means this
 * session is not a walled login at all — back to the door. Any other failure
 * (the server hiccuped) offers a retry rather than throwing a signed-in child out.
 */
export function PersonGate() {
  const router = useRouter();
  const who = useWho();
  const kind = who.data?.kind;
  const status = who.error instanceof ApiError ? who.error.status : null;
  const bounce = who.isError && (status === 401 || status === 403);

  useEffect(() => {
    if (bounce) router.replace("/login");
    else if (kind === "FAMILY") router.replace("/family");
    else if (kind === "MENTOR") router.replace("/mentor");
  }, [bounce, kind, router]);

  if (kind === "SON") return <PersonScreen />;

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 text-center text-sm text-muted">
      {who.isError && !bounce ? (
        <div>
          <p>Couldn’t load your page.</p>
          <button type="button" onClick={() => void who.refetch()} className="press mt-3 inline-flex h-11 items-center rounded-card bg-primary px-4 font-medium text-on-primary">
            Try again
          </button>
        </div>
      ) : (
        "Loading…"
      )}
    </div>
  );
}

export function PersonScreen() {
  const router = useRouter();
  const { data, isLoading } = usePerson();
  const toggle = usePersonTaskToggle();
  const mark = usePersonHabitMark();
  const addTask = usePersonAddTask();
  const deleteTask = usePersonDeleteTask();
  const { show: toast } = useToast();
  const [tab, setTab] = useState<TabId>("today");
  const [title, setTitle] = useState("");
  // The calendar's month ("YYYY-MM", null = this month) and picked day (null = today).
  const [month, setMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Today's positions: the "Where are you?" card's last check-in and the Map tab.
  const location = usePersonLocationDay(null);
  const lastSeen: LocationPointDTO | null = location.data?.lastSeen ?? null;
  // The card wants his last CHECK-IN, not the phone's last point (review, 2026-09-25).
  const lastCheckIn: LocationPointDTO | null =
    location.data?.points.find((p) => p.source === "CHECKIN") ?? (lastSeen?.source === "CHECKIN" ? lastSeen : null);
  const err = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  // Shared time-of-day scene (person + manager Well Being use the same source).
  const { mounted, night, overNight, floatText, scene } = useTimeScene();
  const qc = useQueryClient();

  const signOut = async () => {
    await apiDelete("/api/auth").catch(() => {});
    // A shared phone: the next login must not see this one's cached screens (review, 2026-09-25).
    qc.clear();
    router.replace("/login");
  };

  const tasks = data?.tasks ?? [];
  const forYou = tasks.filter((t) => t.addedBy === "MANAGER");
  const own = tasks.filter((t) => t.addedBy === "PERSON");
  const segments = data?.segments ?? [];
  const rules = data?.nonNegotiables ?? [];
  // Latest report first (date, then when it was written).
  const reports = [...(data?.reports ?? [])].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);

  const add = () => {
    const t = title.trim();
    if (!t || addTask.isPending) return;
    addTask.mutate({ title: t }, { onSuccess: () => setTitle(""), onError: err });
  };

  const available: { id: TabId; label: string; icon: typeof Sun }[] = [
    { id: "today", label: "Today", icon: ListChecks },
    ...(segments.length > 0 ? [{ id: "habits" as const, label: "Habits", icon: Sun }] : []),
    ...(rules.length > 0 ? [{ id: "rules" as const, label: "Rules", icon: ShieldCheck }] : []),
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "money", label: "Money", icon: Wallet },
    { id: "map", label: "Map", icon: MapPin },
  ];
  const active = available.some((t) => t.id === tab) ? tab : "today";
  const busy = toggle.isPending || mark.isPending || addTask.isPending || deleteTask.isPending;

  // The pill row slides sideways; the active pill brings itself into view.
  const tabBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabBar.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);

  // Moving to another month picks its first day; back on this month, today.
  const pickMonth = (m: string) => {
    if (!data) return;
    setMonth(m);
    setSelected(m === monthOf(data.today) ? data.today : `${m}-01`);
  };

  return (
    <div className="relative min-h-dvh bg-bg">
      <div aria-hidden className="wb-scene wb-scene-full">
        {mounted ? <WellBeingScene night={night} /> : null}
        {/* The same picture the CEO's Well Being wears — the person's screen is the
            other half of the same room (owner, 2026-09-08). */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
          style={{
            backgroundImage: "url('/well-being.jpg')",
            filter: night ? "saturate(112%) brightness(0.9)" : "saturate(108%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: night
              ? "linear-gradient(180deg, rgba(10,14,32,0.18) 0%, rgba(10,14,32,0.42) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.22) 100%)",
          }}
        />
      </div>
      <div
        className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col"
        style={{
          paddingTop: "max(2rem, env(safe-area-inset-top))",
          paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        <header className="relative mb-5 text-center">
          {/* Night: a soft blurred dark halo behind the greeting so the white text
              stays readable even where a bright star sits under a glyph. */}
          {overNight ? (
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-[52%] z-0 h-24 w-[26rem] max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-xl" style={{ background: "rgba(9,13,38,0.9)" }} />
          ) : null}
          <h1 className={cn("relative z-10 font-display text-page-lg font-bold", floatText)}>
            {mounted ? greeting() : "Hello"}{data?.name ? `, ${data.name}` : ""}!
          </h1>
        </header>

        {data?.reminder ? (
          <div className={cn("pk-glass mb-5 flex items-start gap-3 rounded-sheet p-4", scene)}>
            <Bell className={cn("mt-0.5 h-5 w-5 shrink-0", overNight ? "text-warn" : "text-warn-ink")} strokeWidth={2} aria-hidden />
            <div className="min-w-0">
              <p className="pk-fg font-display text-base font-semibold">{data.reminder.title}</p>
              {data.reminder.body ? <p className="pk-fg mt-0.5 text-sm">{data.reminder.body}</p> : null}
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className={cn("py-16 text-center text-sm", overNight ? "text-on-primary" : "text-muted")}>Loading…</div>
        ) : (
          // One frosted-glass working panel holds the tabs + the active section.
          <div className={cn("pk-glass rounded-sheet p-2.5 sm:p-3", scene)}>
            {/* Tab bar — glassy pills; the active one a brighter frosted glass.
                Six pills outgrow a 390px phone, so the row slides sideways (no
                wrap, snap) and the active pill scrolls itself into view. */}
            <div ref={tabBar} className="no-scrollbar mb-2.5 flex snap-x gap-1.5 overflow-x-auto" role="tablist" aria-label="Your day">
              {available.map((t) => {
                const Icon = t.icon;
                const on = active === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(t.id)}
                    className={cn("pk-press flex h-11 shrink-0 snap-start items-center justify-center gap-1.5 whitespace-nowrap rounded-card px-3.5 text-sm font-semibold sm:gap-2 sm:text-base", on ? "pk-tab-active" : "pk-tab pk-tab-hover")}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden /> {t.label}
                  </button>
                );
              })}
            </div>

            <main className="p-1.5">
              {active === "today" ? (
                <div className="space-y-5">
                  {tasks.length === 0 ? (
                    <div className="px-6 pb-2 pt-8 text-center">
                      <p className="text-4xl" aria-hidden>🎈</p>
                      <p className="pk-fg mt-3 font-display text-lg">Nothing to do right now</p>
                      <p className="pk-fg-soft mt-1 text-sm">Add something of your own below, or check back later.</p>
                    </div>
                  ) : allDone ? (
                    <div className="pk-cell pk-done flex flex-col items-center rounded-sheet px-6 py-6 text-center">
                      <Star className="h-10 w-10" strokeWidth={1.5} fill="currentColor" aria-hidden />
                      <p className="mt-2 font-display text-xl font-semibold">All done — amazing! 🎉</p>
                    </div>
                  ) : null}

                  {/* Where he is comes first: one tap, before the day's list. */}
                  <CheckInCard lastSeen={lastCheckIn} />

                  {forYou.length > 0 ? (
                    <div>
                      <SubHeading>For you</SubHeading>
                      <ul className="space-y-2.5">
                        {forYou.map((t) => (
                          <TaskRow key={t.id} task={t} onToggle={() => toggle.mutate({ id: t.id, done: !t.done })} />
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <SubHeading>Your own</SubHeading>
                    {own.length > 0 ? (
                      <ul className="mb-2.5 space-y-2.5">
                        {own.map((t) => (
                          <TaskRow key={t.id} task={t} onToggle={() => toggle.mutate({ id: t.id, done: !t.done })} onRemove={() => deleteTask.mutate(t.id, { onError: err })} />
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                        placeholder="Add something of your own…"
                        aria-label="Add something of your own"
                        maxLength={200}
                        className={cn(inputCls, "min-w-0 flex-1")}
                      />
                      <button type="button" onClick={add} disabled={!title.trim() || addTask.isPending} aria-label="Add" className="press grid h-11 w-11 shrink-0 place-items-center rounded-card bg-primary text-on-primary disabled:opacity-40">
                        <Plus className="h-5 w-5" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div>
                    <SubHeading>From your tutors</SubHeading>
                    {reports.length === 0 ? (
                      <p className="pk-fg-soft py-2 text-sm">No reports yet.</p>
                    ) : (
                      <ul className="space-y-2.5">
                        {reports.map((r) => (
                          <ReportRow key={r.id} report={r} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              {active === "habits" && data ? (
                <div className="space-y-6">
                  {segments.map((seg) => (
                    <SegmentGrid key={seg.id} seg={seg} week={data.week} today={data.today} showScore={false} maxDate={data.today} glass onMark={(habitId, date, value) => mark.mutate({ habitId, date, value })} />
                  ))}
                </div>
              ) : null}

              {active === "rules" && data ? (
                <div>
                  <p className="pk-fg-soft mb-4 text-sm">These hold every day. A day is marked only if a line was crossed.</p>
                  <div className="space-y-5">
                    {rules.map((r) => (
                      <RuleRow key={r.id} rule={r} week={data.week} today={data.today} />
                    ))}
                  </div>
                </div>
              ) : null}

              {active === "calendar" && data ? (
                <PersonCalendar today={data.today} month={month ?? monthOf(data.today)} selected={selected ?? data.today} onMonth={pickMonth} onSelect={setSelected} />
              ) : null}

              {active === "money" && data ? <PersonMoney today={data.today} /> : null}

              {active === "map" && data ? (
                <PersonMap points={location.data?.points ?? []} sharingOn={location.data?.sharing.on ?? false} loading={location.isLoading && !location.data} />
              ) : null}
            </main>
          </div>
        )}

        <footer className="mt-8 text-center">
          <button type="button" onClick={signOut} className={cn("press inline-flex h-11 items-center gap-1.5 rounded-card px-3 text-sm font-medium", overNight ? "text-on-primary hover:opacity-80" : "text-ink hover:opacity-80")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LogOut className="h-3.5 w-3.5" aria-hidden />}
            Sign out
          </button>
        </footer>
      </div>
    </div>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  // Plain case, no CSS transform: what the DOM says is exactly what the eye sees.
  return <p className="mb-2 text-micro font-semibold pk-fg-soft">{children}</p>;
}

/** The Calendar tab: the month loads only while this tab is open. No habit
    rollup on the person's side — the server sends habits as null anyway. */
function PersonCalendar({ today, month, selected, onMonth, onSelect }: { today: string; month: string; selected: string; onMonth: (m: string) => void; onSelect: (d: string) => void }) {
  const { data, isError, refetch } = usePersonCalendar(month);
  return <CalendarView data={data} month={month} onMonth={onMonth} today={today} selected={selected} onSelect={onSelect} showHabits={false} failed={isError} onRetry={() => void refetch()} />;
}

/** The Map tab — his own view of today: the map, the day's check-ins, and
    whether his phone is sharing its position with his parents. Nothing here is
    hidden from him: if sharing is on, this line says so. */
function PersonMap({ points, sharingOn, loading }: { points: LocationPointDTO[]; sharingOn: boolean; loading: boolean }) {
  const checkins = points.filter((p) => p.source === "CHECKIN");
  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-5 w-5 shrink-0 pk-fg-soft" strokeWidth={2} aria-hidden />
        <h2 className="font-display text-lg font-semibold pk-fg">Map</h2>
        <span className="ml-auto shrink-0 text-sm pk-fg-soft">Today</span>
      </div>

      <LocationMapLazy points={points} height={280} />

      <h3 className="mb-2 mt-4 text-sm font-semibold pk-fg">Check-ins</h3>
      {loading ? (
        <p className="py-2 text-sm pk-fg-soft">Loading…</p>
      ) : checkins.length === 0 ? (
        <p className="py-2 text-sm pk-fg-soft">No check-in yet today.</p>
      ) : (
        <ul className="space-y-2">
          {checkins.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-card pk-cell px-3 py-2.5">
              <span className="shrink-0 text-sm font-semibold tabular-nums pk-fg">{clockTime(p.at)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm pk-fg">{p.place ?? "Check-in"}</p>
                {p.note ? <p className="truncate text-micro pk-fg-soft">{p.note}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm pk-fg">
        Sharing with your parents: <span className="font-semibold">{loading ? "…" : sharingOn ? "on" : "off"}</span>
      </p>
    </section>
  );
}

/** One big tappable task row with the tick circle. The person's own extras carry
    a remove button beside the tap area (a button can't sit inside a button). */
function TaskRow({ task, onToggle, onRemove }: { task: RoutineTaskDTO; onToggle: () => void; onRemove?: () => void }) {
  return (
    <li className={cn("pk-press flex items-center rounded-card", task.done ? "pk-cell pk-met" : "pk-cell pk-row-hover")}>
      <button type="button" onClick={onToggle} aria-pressed={task.done} className="flex min-w-0 flex-1 items-center gap-4 rounded-card p-4 text-left">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full border-2", task.done ? "border-ok bg-ok text-on-primary" : "pk-cell-ring text-transparent")}>
          <Check className="h-6 w-6" strokeWidth={3} aria-hidden />
        </span>
        <span className={cn("pk-fg min-w-0 flex-1 break-words text-lg font-medium", task.done && "line-through opacity-70")}>{task.title}</span>
      </button>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${task.title}`} className="press mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink">
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}

/** One tutor's day report: what they teach · who · when, what was covered, and
    the homework line in bold when there is one. */
function ReportRow({ report }: { report: MentorReportDTO }) {
  return (
    <li className="rounded-card pk-cell p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="pk-fg min-w-0 truncate text-sm font-semibold">
          {report.subject} <span className="pk-fg-soft font-normal">· {report.mentorName}</span>
        </p>
        <span className="pk-fg-soft shrink-0 text-micro">{prettyDate(report.date)}</span>
      </div>
      <p className="pk-fg mt-1.5 whitespace-pre-line break-words text-sm">{report.covered}</p>
      {report.homework ? (
        <p className="pk-fg mt-1.5 whitespace-pre-line break-words text-sm">
          <span className="font-bold">Homework:</span> {report.homework}
        </p>
      ) : null}
    </li>
  );
}

/** One rule + its scheduled days — glassy cells. Only the manager's scheduled days are
    actionable: a green ✓ = done, a soft cell = to do (tap). Non-scheduled days are inert;
    days after today are locked. Tap-to-mark logic unchanged (styling only). */
function RuleRow({
  rule,
  week,
  today,
}: {
  rule: PersonViewDTO["nonNegotiables"][number];
  week: PersonViewDTO["week"];
  today: string;
}) {
  const crossed = Object.keys(rule.days).length;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="pk-fg min-w-0 text-base font-medium">{rule.name}</p>
        <span className={cn("shrink-0 text-micro", crossed > 0 ? "font-semibold text-warn-ink" : "pk-fg-soft")}>{crossed === 0 ? "held all week" : `${crossed} crossed`}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {week.days.map((d) => {
          const isCrossed = rule.days[d] === true;
          return (
            <div
              key={d}
              role="img"
              aria-label={`${rule.name}, ${weekdayInitial(d)} \u2014 ${isCrossed ? "crossed" : d > today ? "not yet" : "held"}`}
              className={cn("grid h-11 place-items-center rounded-card text-sm", isCrossed ? "pk-cell pk-missed font-semibold" : "pk-cell", d > today ? "opacity-45" : "", d === today ? "pk-today" : "")}
            >
              {isCrossed ? <X className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : weekdayInitial(d)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
