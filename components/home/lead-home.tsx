"use client";

import { ArrowRight, CalendarOff, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { FirstRunHint } from "@/components/first-run-hint";
import { TaskTitle } from "@/components/task-title";
import { cn } from "@/lib/cn";
import { dateState } from "@/lib/dates";
import { useOverview } from "@/lib/hooks/use-overview";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useAllTasks } from "@/lib/hooks/use-tasks";
import { useMe } from "@/lib/hooks/use-users";
import { STATUS_STYLE, STATUS_FILL } from "@/lib/status";
import { STATUSES, type Status } from "@/lib/types";

/**
 * A lead's home is the tools they own, not the whole portfolio. The two
 * nudge lists are the jobs only a lead can clear — work with no date and work
 * with nobody on it — so the page is a to-do list, not a report.
 */
export function LeadHome() {
  const { data: me } = useMe();
  const { data, isLoading } = useOverview();
  const { data: allTasks } = useAllTasks();
  const { openTask } = usePanelParams();

  const mine = useMemo(
    () => (data?.projects ?? []).filter((p) => p.leadId === me?.id),
    [data, me],
  );
  const mineIds = useMemo(() => new Set(mine.map((p) => p.id)), [mine]);

  const needsDate = useMemo(
    () =>
      (allTasks ?? [])
        .filter(
          (t) =>
            mineIds.has(t.projectId ?? "") &&
            t.dueDate === null &&
            t.status !== "DONE" &&
            t.status !== "CANCELLED",
        )
        .slice(0, 12),
    [allTasks, mineIds],
  );

  const unassigned = useMemo(
    () =>
      (allTasks ?? [])
        .filter(
          (t) =>
            mineIds.has(t.projectId ?? "") &&
            t.assigneeId === null &&
            t.status !== "DONE" &&
            t.status !== "CANCELLED",
        )
        .slice(0, 12),
    [allTasks, mineIds],
  );

  if (isLoading || !data) {
    return (
      <div className="space-y-3 px-4 py-4 sm:px-8 sm:py-6" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-hover" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      <FirstRunHint id="lead-home">
        The projects you lead, and the two things only you can clear.
      </FirstRunHint>

      {mine.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">
          You are not leading a project yet. A manager assigns leads from a project&apos;s
          About &amp; requirements panel.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {mine.map((p) => {
            const pct =
              p.totalLeaves === 0
                ? 0
                : Math.round((p.doneLeaves / p.totalLeaves) * 100);
            const total = STATUSES.reduce((n, s) => n + (p.statusCounts[s] ?? 0), 0);
            return (
              <article key={p.id} className="card p-4">
                <header className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: p.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-section font-semibold text-ink">
                      {p.name}
                    </h2>
                    <span className="block text-micro text-muted">
                      {total} task{total === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-page font-bold tabular-nums text-ink">
                    {pct}
                    <span className="text-micro font-semibold text-muted">%</span>
                  </span>
                </header>

                <StatusMiniBar counts={p.statusCounts} />

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <CallToAction
                    href={`/t/${p.slug}/overview`}
                    tone="danger"
                    n={p.overdue}
                    label="overdue"
                  />
                  <CallToAction
                    href={`/t/${p.slug}/overview`}
                    tone="warn"
                    n={p.atRisk}
                    label="at risk"
                  />
                  <CallToAction
                    href={`/t/${p.slug}/overview`}
                    tone="muted"
                    n={p.unscheduled}
                    label="undated"
                  />
                  <Link
                    href={`/t/${p.slug}`}
                    className="press ml-auto flex h-6 items-center gap-1 rounded-chip bg-hover px-2 text-micro text-ink"
                  >
                    Open <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <NudgeList
          title="Needs a date"
          icon={CalendarOff}
          empty="Everything in your projects is scheduled."
          tasks={needsDate}
          onOpen={openTask}
        />
        <NudgeList
          title="Unassigned"
          icon={UserPlus}
          empty="Everything in your projects has an owner."
          tasks={unassigned}
          onOpen={openTask}
        />
      </div>
    </div>
  );
}

/** One row of colour per status — a donut is too much for a card this size. */
function StatusMiniBar({ counts }: { counts: Record<Status, number> }) {
  const total = STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0);
  if (total === 0) {
    return <p className="mt-3 text-micro text-muted">No tasks yet.</p>;
  }
  return (
    <span className="mt-3 flex h-2.5 w-full overflow-hidden rounded-chip bg-hover">
      {STATUSES.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
        <span
          key={s}
          className={cn("block h-full", STATUS_FILL[s])}
          style={{ width: `${(counts[s] / total) * 100}%` }}
          title={`${counts[s]} ${STATUS_STYLE[s].label.toLowerCase()}`}
        />
      ))}
    </span>
  );
}

function CallToAction({
  href,
  tone,
  n,
  label,
}: {
  href: string;
  tone: "danger" | "warn" | "muted";
  n: number;
  label: string;
}) {
  if (n === 0) return null;
  return (
    <Link
      href={href}
      className={cn(
        "press flex h-6 items-center rounded-chip px-2 text-micro font-medium",
        tone === "danger" && "bg-danger-soft text-danger-ink",
        tone === "warn" && "bg-warn-soft text-warn-ink",
        tone === "muted" && "bg-hover text-muted",
      )}
    >
      {n} {label}
    </Link>
  );
}

function NudgeList({
  title,
  icon: Icon,
  empty,
  tasks,
  onOpen,
}: {
  title: string;
  icon: typeof CalendarOff;
  empty: string;
  tasks: Array<{ id: string; title: string; status: Status; dueDate: string | null }>;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="card overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">
        <Icon className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
        {title}
        <span className="text-micro font-normal tabular-nums text-muted">
          {tasks.length}
        </span>
      </h2>
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-150 ease-out hover:bg-hover"
              >
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_STYLE[t.status].dot)}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  <TaskTitle title={t.title} />
                </span>
                {dateState(t.dueDate, t.status) === "overdue" ? (
                  <span className="shrink-0 text-micro font-semibold text-danger-ink">
                    overdue
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
