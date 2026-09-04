"use client";

import { Bell, Check, ListChecks, Loader2, LogOut, ShieldCheck, Star, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { apiDelete } from "@/lib/api";
import { usePerson, usePersonHabitMark, usePersonNonNegotiableMark, usePersonTaskToggle } from "@/lib/hooks/use-routine";
import { useTimeScene } from "@/lib/hooks/use-time-scene";
import type { PersonViewDTO } from "@/lib/types";
import { WellBeingScene } from "./well-being-scene";
import { SegmentGrid } from "./weekly-grid";
import { weekdayInitial } from "./shared";

/**
 * The PERSON's whole app — one calm, friendly screen in TABS (Tasks / Habits / Rules).
 * A PERSON reaches nothing else (middleware confines them to /person + /api/routine/kid,
 * every work API 403s them; they WRITE only their own habit marks, task checks, and the
 * `done` flag on days the manager scheduled — never the schedule itself).
 *
 * Phase 44: a code-rendered soft-3D scene (`WellBeingScene`) sits behind everything —
 * warm dawn 06:00–17:59 local, calm starry dusk 18:00–05:59 — gently animated. Phase
 * 45: the working UI is FROSTED GLASS over that scene (translucent + backdrop-blur, a
 * light sheen border, soft depth), with glassy interactive tabs + cells; text goes dark
 * on the day glass, light on the night glass. Phase 46: the scene + glass primitives
 * (`WellBeingScene`, `useTimeScene`, the `.pk-*` glass classes) are SHARED with the
 * manager Well Being tab. Purely cosmetic — nothing about permissions, data, endpoints,
 * or the tap-cycle logic changed.
 */
type TabId = "tasks" | "habits" | "rules";

export function PersonScreen() {
  const router = useRouter();
  const { data, isLoading } = usePerson();
  const toggle = usePersonTaskToggle();
  const mark = usePersonHabitMark();
  const markRule = usePersonNonNegotiableMark();
  const [tab, setTab] = useState<TabId>("tasks");

  // Shared time-of-day scene (person + manager Well Being use the same source).
  const { mounted, night, overNight, floatText, scene } = useTimeScene();

  const signOut = async () => {
    await apiDelete("/api/auth").catch(() => {});
    router.replace("/login");
  };

  const tasks = data?.tasks ?? [];
  const segments = data?.segments ?? [];
  const rules = data?.nonNegotiables ?? [];
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);

  const available: { id: TabId; label: string; icon: typeof Sun }[] = [
    { id: "tasks", label: "Tasks", icon: ListChecks },
    ...(segments.length > 0 ? [{ id: "habits" as const, label: "Habits", icon: Sun }] : []),
    ...(rules.length > 0 ? [{ id: "rules" as const, label: "Rules", icon: ShieldCheck }] : []),
  ];
  const active = available.some((t) => t.id === tab) ? tab : "tasks";

  return (
    <div className="relative min-h-dvh bg-bg">
      <div aria-hidden className="wb-scene wb-scene-full">
        {mounted ? <WellBeingScene night={night} /> : null}
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
            {/* Tab bar — glassy pills; the active one a brighter frosted glass. */}
            <div className="mb-2.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${available.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Your day">
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
                    className={cn("pk-press flex items-center justify-center gap-2 rounded-card py-2.5 text-base font-semibold", on ? "pk-tab-active" : "pk-tab pk-tab-hover")}
                  >
                    <Icon className="h-4 w-4" aria-hidden /> {t.label}
                  </button>
                );
              })}
            </div>

            <main className="p-1.5">
              {active === "tasks" ? (
                tasks.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-4xl" aria-hidden>🎈</p>
                    <p className="pk-fg mt-3 font-display text-lg">Nothing to do right now</p>
                    <p className="pk-fg-soft mt-1 text-sm">Check back later!</p>
                  </div>
                ) : (
                  <>
                    {allDone ? (
                      <div className="pk-cell pk-done mb-4 flex flex-col items-center rounded-sheet px-6 py-6 text-center">
                        <Star className="h-10 w-10" strokeWidth={1.5} fill="currentColor" aria-hidden />
                        <p className="mt-2 font-display text-xl font-semibold">All done — amazing! 🎉</p>
                      </div>
                    ) : null}
                    <ul className="space-y-2.5">
                      {tasks.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => toggle.mutate({ id: t.id, done: !t.done })}
                            aria-pressed={t.done}
                            className={cn("pk-press flex w-full items-center gap-4 rounded-card p-4 text-left", t.done ? "pk-cell pk-met" : "pk-cell pk-row-hover")}
                          >
                            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full border-2", t.done ? "border-ok bg-ok text-on-primary" : "pk-cell-ring text-transparent")}>
                              <Check className="h-6 w-6" strokeWidth={3} aria-hidden />
                            </span>
                            <span className={cn("pk-fg min-w-0 flex-1 text-lg font-medium", t.done && "line-through opacity-70")}>{t.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )
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
                  <p className="pk-fg-soft mb-4 text-sm">Check off each day you did it.</p>
                  <div className="space-y-5">
                    {rules.map((r) => (
                      <RuleRow key={r.id} rule={r} week={data.week} today={data.today} onToggle={(date, done) => markRule.mutate({ nonNegotiableId: r.id, date, done })} />
                    ))}
                  </div>
                </div>
              ) : null}
            </main>
          </div>
        )}

        <footer className="mt-8 text-center">
          <button type="button" onClick={signOut} className={cn("press inline-flex h-9 items-center gap-1.5 rounded-card px-3 text-sm font-medium", overNight ? "text-on-primary hover:opacity-80" : "text-ink hover:opacity-80")}>
            {toggle.isPending || mark.isPending || markRule.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LogOut className="h-3.5 w-3.5" aria-hidden />}
            Sign out
          </button>
        </footer>
      </div>
    </div>
  );
}

/** One rule + its scheduled days — glassy cells. Only the manager's scheduled days are
    actionable: a green ✓ = done, a soft cell = to do (tap). Non-scheduled days are inert;
    days after today are locked. Tap-to-mark logic unchanged (styling only). */
function RuleRow({
  rule,
  week,
  today,
  onToggle,
}: {
  rule: PersonViewDTO["nonNegotiables"][number];
  week: PersonViewDTO["week"];
  today: string;
  onToggle: (date: string, done: boolean) => void;
}) {
  return (
    <div>
      <p className="pk-fg mb-1.5 text-base font-medium">{rule.name}</p>
      <div className="grid grid-cols-7 gap-1.5">
        {week.days.map((d) => {
          const scheduled = d in rule.days;
          const done = rule.days[d] ?? false;
          const locked = !scheduled || d > today;
          return (
            <button
              key={d}
              type="button"
              disabled={locked}
              onClick={() => onToggle(d, !done)}
              aria-pressed={done}
              aria-label={`${rule.name}, ${weekdayInitial(d)} — ${!scheduled ? "not scheduled" : done ? "done" : "to do"}${locked ? "" : " (tap to mark done)"}`}
              className={cn(
                "pk-press grid h-11 place-items-center rounded-card border text-sm",
                !scheduled
                  ? "pk-cell opacity-25"
                  : done
                    ? "pk-cell pk-done"
                    : d > today
                      ? "pk-cell opacity-45"
                      : "pk-cell pk-todo pk-row-hover",
                d === today && scheduled ? "pk-today" : "",
              )}
            >
              {scheduled && done ? <Check className="h-5 w-5" strokeWidth={3} aria-hidden /> : weekdayInitial(d)}
            </button>
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
