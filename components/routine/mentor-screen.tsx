"use client";

import { Loader2, LogOut, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ApiError, apiDelete } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useMentor, useMentorReportAdd, useMentorReportDelete, useWho } from "@/lib/hooks/use-routine";
import { useTimeScene } from "@/lib/hooks/use-time-scene";
import type { MentorReportDTO, MentorViewDTO } from "@/lib/types";
import { WellBeingScene } from "./well-being-scene";
import { Labeled, inputCls, prettyDate, weekdayShort } from "./shared";

/**
 * The tutor's / coach's whole app (2026-09-25 — the circle). A MENTOR is a walled
 * PERSON-role login that sees ONE screen: for each child they teach, a short
 * "Today's report" form and their past reports. Nothing else of Orbit is reachable
 * (middleware confines them to /mentor + /api/routine/*; the handlers refuse the
 * rest). It wears the same full-page scene + frosted glass as the person screen —
 * the tutor stands in the same room, just inside the door.
 */

/** The door: which walled login is this? Only a MENTOR stays; the son and a
    co-parent go to their own screens; anyone else goes to the login. */
export function MentorGate() {
  const router = useRouter();
  const who = useWho();
  const kind = who.data?.kind;
  // Only a real refusal (401/403) means "signed out"; a dropped request is not (review, 2026-09-25).
  const whoStatus = who.error instanceof ApiError ? who.error.status : null;
  const bounce = who.isError && (whoStatus === 401 || whoStatus === 403);
  useEffect(() => {
    if (bounce) router.replace("/login");
    else if (kind === "SON") router.replace("/person");
    else if (kind === "FAMILY") router.replace("/family");
  }, [bounce, kind, router]);

  if (who.data?.kind === "MENTOR") return <MentorScreen name={who.data.name} />;
  return (
    <Shell>
      {who.isError && !bounce ? (
        <div className="py-16 text-center">
          <p className="pk-fg text-sm">Couldn’t load your page.</p>
          <button type="button" onClick={() => void who.refetch()} className="press mt-3 inline-flex h-11 items-center rounded-card bg-primary px-4 text-sm font-medium text-on-primary">
            Try again
          </button>
        </div>
      ) : (
        <p className="pk-fg py-16 text-center text-sm">Loading…</p>
      )}
    </Shell>
  );
}

export function MentorScreen({ name }: { name?: string }) {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useMentor();
  useEffect(() => {
    if (error instanceof ApiError && error.status === 403) router.replace("/login");
  }, [error, router]);

  return (
    <Shell name={data?.name ?? name}>
      {isLoading ? (
        <p className="pk-fg py-16 text-center text-sm">Loading…</p>
      ) : error ? (
        <section className="rounded-sheet pk-glass p-6 text-center">
          <p className="pk-fg text-base font-semibold">Could not load your reports.</p>
          <button type="button" onClick={() => void refetch()} className="pk-press pk-btn mt-3 inline-flex h-11 items-center rounded-card px-4 text-sm font-medium">
            Try again
          </button>
        </section>
      ) : data && data.students.length === 0 ? (
        <section className="rounded-sheet pk-glass p-6 text-center">
          <p className="text-4xl" aria-hidden>
            🌱
          </p>
          <p className="pk-fg mt-3 text-base">Nobody to report on yet — ask the parent to add you.</p>
        </section>
      ) : data ? (
        <div className="space-y-4">
          {data.students.map((s) => (
            <StudentPanel key={s.collaboratorId} student={s} today={data.today} />
          ))}
        </div>
      ) : null}
    </Shell>
  );
}

type Student = MentorViewDTO["students"][number];

// A glass textarea: inputCls without the fixed height (rows decide), padded all round.
const areaCls = "pk-input w-full resize-none rounded-input p-3 text-sm outline-none transition-colors duration-150 ease-out";

/** One child: the report form for a day, then every report this mentor sent. */
function StudentPanel({ student, today }: { student: Student; today: string }) {
  const { show: toast } = useToast();
  const add = useMentorReportAdd();
  const remove = useMentorReportDelete();
  const [date, setDate] = useState(today);
  const [covered, setCovered] = useState("");
  const [homework, setHomework] = useState("");
  const [homeworkDue, setHomeworkDue] = useState("");
  const [note, setNote] = useState("");
  // The line for the parents is the truly optional one — folded away until wanted.
  const [noteOpen, setNoteOpen] = useState(false);
  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const title = student.subject ? `${student.personName} · ${student.subject}` : student.personName;
  const canSend = covered.trim().length > 0 && !add.isPending;

  const send = () => {
    if (!canSend) return;
    add.mutate(
      {
        collaboratorId: student.collaboratorId,
        date,
        covered: covered.trim(),
        homework: homework.trim() || undefined,
        homeworkDue: homework.trim() && homeworkDue ? homeworkDue : undefined,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast({ message: "Report sent" });
          // The date stays: a tutor often sends two in a row for the same day.
          setCovered("");
          setHomework("");
          setHomeworkDue("");
          setNote("");
          setNoteOpen(false);
        },
        onError: fail,
      },
    );
  };

  const removeReport = (r: MentorReportDTO) => {
    if (!window.confirm(`Remove the ${prettyDate(r.date)} report?`)) return;
    remove.mutate(r.id, { onError: fail });
  };

  return (
    <section className="rounded-sheet pk-glass p-4 sm:p-5">
      <h2 className="pk-fg mb-3 truncate font-display text-lg font-semibold">{title}</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="space-y-3"
        aria-label={`Today's report for ${student.personName}`}
      >
        <p className="pk-fg text-base font-medium">Today&apos;s report</p>
        <Labeled label="Date">
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} required className={cn(inputCls, "min-w-0")} />
        </Labeled>
        <Labeled label="What was covered">
          <textarea value={covered} onChange={(e) => setCovered(e.target.value)} rows={3} required placeholder="What you did together today" className={areaCls} />
        </Labeled>
        <Labeled label="Homework">
          <textarea value={homework} onChange={(e) => setHomework(e.target.value)} rows={2} placeholder="Optional — it lands on the student's list as a task" className={areaCls} />
        </Labeled>
        {homework.trim() ? (
          <Labeled label="Homework is for">
            <input type="date" value={homeworkDue} min={date} onChange={(e) => setHomeworkDue(e.target.value)} aria-label="Homework is for" className={cn(inputCls, "min-w-0")} />
            <p className="pk-fg-soft mt-1 text-micro">Leave it empty for the day after this session.</p>
          </Labeled>
        ) : null}
        {noteOpen ? (
          <Labeled label="A line for the parents">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" autoFocus className={cn(inputCls, "min-w-0")} />
          </Labeled>
        ) : (
          <button type="button" onClick={() => setNoteOpen(true)} className="pk-press pk-btn inline-flex h-11 items-center gap-1.5 rounded-card px-3 text-sm font-medium">
            <Plus className="h-4 w-4" aria-hidden /> Add a line for the parents
          </button>
        )}
        <button type="submit" disabled={!canSend} className="press flex h-11 w-full items-center justify-center gap-2 rounded-card bg-primary text-sm font-semibold text-on-primary disabled:opacity-40">
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Send
        </button>
      </form>

      <h3 className="pk-fg mb-2 mt-5 text-base font-medium">Past reports</h3>
      {student.reports.length === 0 ? (
        <p className="pk-fg-soft py-3 text-center text-sm">No reports yet.</p>
      ) : (
        <ul className="space-y-2">
          {student.reports.map((r) => (
            <li key={r.id} className="relative min-w-0 rounded-card pk-cell py-2.5 pl-3 pr-12">
              <p className="pk-fg-soft text-micro">
                {prettyDate(r.date)} · {weekdayShort(r.date)}
              </p>
              <p className="pk-fg whitespace-pre-wrap break-words text-sm">{r.covered}</p>
              {r.homework ? (
                <p className="pk-fg mt-1 whitespace-pre-wrap break-words text-sm">
                  <span className="font-medium">Homework:</span> {r.homework}
                </p>
              ) : null}
              {r.note ? <p className="pk-fg-soft mt-1 break-words text-sm">{r.note}</p> : null}
              <button
                type="button"
                onClick={() => removeReport(r)}
                disabled={remove.isPending}
                aria-label={`Remove the ${prettyDate(r.date)} report`}
                className="press absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-card pk-fg-soft hover:bg-[color:var(--pk-cell)] hover:text-danger-ink disabled:opacity-40"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The full-page scene + greeting + sign-out that the person screen wears, so the
    door (gate), the loading line and the screen all stand in the same room. */
function Shell({ name, children }: { name?: string; children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { mounted, night, overNight, floatText, scene } = useTimeScene();

  const signOut = async () => {
    await apiDelete("/api/auth").catch(() => {});
    // A shared phone: the next login must not see this one's cached screens (review, 2026-09-25).
    qc.clear();
    router.replace("/login");
  };

  return (
    <div className="relative min-h-dvh bg-bg">
      <div aria-hidden className="wb-scene wb-scene-full">
        {mounted ? <WellBeingScene night={night} /> : null}
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
      {/* The scene class sits on the whole column so every glass piece below reads
          the same day/night tints. */}
      <div
        className={cn("relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col", scene)}
        style={{
          paddingTop: "max(2rem, env(safe-area-inset-top))",
          paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        <header className="relative mb-5 text-center">
          {overNight ? (
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-[52%] z-0 h-24 w-[26rem] max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-xl" style={{ background: "rgba(9,13,38,0.9)" }} />
          ) : null}
          <h1 className={cn("relative z-10 truncate font-display text-page-lg font-bold", floatText)}>
            {mounted ? greeting() : "Hello"}
            {name ? `, ${name}` : ""}!
          </h1>
        </header>

        <div className="min-w-0 flex-1">{children}</div>

        <footer className="mt-8 text-center">
          <button type="button" onClick={signOut} className={cn("press inline-flex h-11 items-center gap-1.5 rounded-card px-3 text-sm font-medium", overNight ? "text-on-primary hover:opacity-80" : "text-ink hover:opacity-80")}>
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </footer>
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
