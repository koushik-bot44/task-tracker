"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarClock, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { MeetingBreadcrumb } from "./meeting-breadcrumb";
import { ProgressRing } from "@/components/home/progress-ring";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useOverview } from "@/lib/hooks/use-overview";
import { useMeetings } from "@/lib/hooks/use-meetings";

/** Level 2: the department's project cards — completion ring (leaf rollup), lead,
    team size, and an upcoming-meeting badge. Click drills into the project. */
export function MeetingsDepartment({ departmentId }: { departmentId: string }) {
  const reduce = useReducedMotion();
  const { data: departments } = useDepartments();
  const dept = departments?.find((d) => d.id === departmentId);
  const { data: overview, isLoading } = useOverview(departmentId);
  const { data: meetings } = useMeetings();
  const projects = overview?.projects ?? [];

  const upcomingByProject = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const m = new Map<string, number>();
    for (const mt of meetings ?? []) {
      if (!mt.projectId || new Date(mt.date) < startOfToday) continue;
      m.set(mt.projectId, (m.get(mt.projectId) ?? 0) + 1);
    }
    return m;
  }, [meetings]);

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      <MeetingBreadcrumb crumbs={[{ label: "Meetings", href: "/meetings" }, { label: dept?.name ?? "Department" }]} />

      <header className="mb-4 mt-3 flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-card text-lg"
          style={{ background: dept ? `color-mix(in srgb, ${dept.color} 16%, transparent)` : "var(--hover)" }}
          aria-hidden
        >
          {dept?.icon ?? <span className="h-3 w-3 rounded-full" style={{ background: dept?.color ?? "var(--muted)" }} />}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-page font-bold text-ink">{dept?.name ?? "Department"}</h1>
          <p className="text-micro text-muted">
            {projects.length} project{projects.length === 1 ? "" : "s"} · pick one to schedule a meeting
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-card bg-hover" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">No projects in this department yet.</p>
      ) : (
        <motion.div
          key={departmentId}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {projects.map((p) => {
            const upcoming = upcomingByProject.get(p.id) ?? 0;
            const members = new Set(p.perAssignee.filter((a) => a.userId).map((a) => a.userId)).size;
            return (
              <Link key={p.id} href={`/meetings/project/${p.id}`} className="card lift group block p-4">
                <div className="flex items-start gap-3">
                  <ProgressRing done={p.doneLeaves} total={p.totalLeaves} color={p.color} size={44} stroke={5} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-section font-semibold text-ink">{p.name}</h2>
                    <p className="truncate text-micro text-muted">
                      {p.leadName ?? <span className="italic">No lead assigned</span>}
                    </p>
                  </div>
                  <ArrowRight
                    className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {upcoming > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-chip bg-primary-soft px-2 py-0.5 text-micro font-medium text-primary-ink">
                      <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      {upcoming} upcoming
                    </span>
                  ) : (
                    <span className="text-micro text-muted">No upcoming meetings</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-micro text-muted">
                    <Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    {members} on the team
                  </span>
                </div>
              </Link>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
