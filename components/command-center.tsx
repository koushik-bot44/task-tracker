"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FirstRunHint } from "@/components/first-run-hint";
import { Odometer } from "@/components/home/odometer";
import { ProgressRing } from "@/components/home/progress-ring";
import { Sparkline } from "@/components/home/sparkline";
import { TaskTitle } from "@/components/task-title";
import { formatDMY } from "@/lib/dates";
import { useOverview } from "@/lib/hooks/use-overview";
import { usePanelParams } from "@/lib/hooks/use-panel";
import type { OverviewProject } from "@/lib/types";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDMY(iso);
}

export function CommandCenter() {
  const reduce = useReducedMotion();
  const { data, isLoading } = useOverview();
  const { openTask } = usePanelParams();

  if (isLoading || !data) return <HomeSkeleton />;

  const { projects, global, recent } = data;
  const byId = new Map(projects.map((p) => [p.id, p]));

  if (projects.length === 0) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6 text-center">
        <div>
          <p className="font-display text-2xl text-ink">Nothing in orbit yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Create your first project in the sidebar and the dashboard fills itself in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:px-8 sm:py-6">
      <FirstRunHint id="home">
        Each card is one project — the ring is its share of smallest tasks done.
      </FirstRunHint>

      {/* Global strip — the three numbers worth knowing before anything else. */}
      <section
        aria-label="This week at a glance"
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        <Stat label="Shipped this week" value={global.shippedThisWeek} />
        <Stat label="In flight" value={global.inFlight} />
        <Stat label="Blocked" value={global.blocked} />
      </section>

      <section aria-label="Projects" className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-2">
        {projects.map((project, i) => (
          <motion.div
            key={project.id}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.2,
              delay: reduce ? 0 : Math.min(i * 0.04, 0.2),
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <ToolCard project={project} />
          </motion.div>
        ))}
      </section>

      <section aria-label="Recently completed" className="mt-6 sm:mt-8">
        <h2 className="px-1 pb-3 text-section font-bold text-ink">
          Recently completed
        </h2>
        {recent.length === 0 ? (
          <p className="px-1 text-sm text-muted">Nothing finished yet.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {recent.map((item) => {
              const tool = byId.get(item.projectId);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openTask(item.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-hover"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: tool?.color ?? "var(--muted)" }}
                      aria-hidden
                    />
                    {/* Finished, not illegible: full ink with a light rule
                        through it, rather than muted text and a muted rule. */}
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      <TaskTitle title={item.title} />
                    </span>
                    {tool ? (
                      <span className="hidden shrink-0 text-micro text-muted sm:inline">
                        {tool.name}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-micro tabular-nums text-muted">
                      {relativeTime(item.completedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card lift px-4 py-4 sm:px-5 sm:py-5">
      {/* Big numbers are deep navy and heavy — the hue lives in the pill
          beside them, not in the digits. */}
      <p className="text-display font-extrabold leading-none text-ink">
        <Odometer value={value} />
      </p>
      <p className="mt-1 text-sm font-medium text-muted">{label}</p>
    </div>
  );
}

function ToolCard({ project }: { project: OverviewProject }) {
  return (
    <Link
      href={`/t/${project.slug}`}
      className="card lift group block overflow-hidden p-5"
      style={{ boxShadow: `inset 4px 0 0 0 ${project.color}, var(--shadow-1)` }}
    >
      <div className="flex items-start gap-4">
        <ProgressRing
          done={project.doneLeaves}
          total={project.totalLeaves}
          color={project.color}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-section font-bold text-ink">
              {project.name}
            </h3>
            {project.blocked > 0 ? (
              <span className="shrink-0 rounded-chip bg-danger-soft px-2 py-0.5 text-micro font-semibold text-danger-ink">
                {project.blocked} blocked
              </span>
            ) : null}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-micro text-muted">
            <span className="tabular-nums">{project.inFlight} in flight</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{project.doneLeaves} done</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{project.doneThisWeek} this week</span>
          </p>

          <div className="mt-2">
            <Sparkline values={project.sparkline} color={project.color} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-chip bg-surface-2 px-3 py-2 text-sm">
        {project.nextUp ? (
          <>
            <span className="shrink-0 text-micro uppercase tracking-widest text-muted">
              Next
            </span>
            <span className="min-w-0 flex-1 truncate text-ink">
              <TaskTitle title={project.nextUp.title} />
            </span>
          </>
        ) : (
          <span className="flex-1 text-muted">Nothing queued</span>
        )}
        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          strokeWidth={2}
          aria-hidden
        />
      </div>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5 sm:py-6" aria-hidden>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[5.25rem] animate-pulse rounded-xl bg-hover" />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[11rem] animate-pulse rounded-xl bg-hover" />
        ))}
      </div>
    </div>
  );
}
