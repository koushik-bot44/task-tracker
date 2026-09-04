"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjects } from "@/lib/hooks/use-projects";
import { useMeetings } from "@/lib/hooks/use-meetings";

/** Level 1 of the Meetings drill-down: the manager's own departments as cards,
    each showing its project count and how many upcoming meetings it holds. */
export function MeetingsHome() {
  const reduce = useReducedMotion();
  const { data: departments, isLoading } = useDepartments();
  const { data: projects } = useProjects();
  const { data: meetings } = useMeetings();

  const upcomingByDept = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const projDept = new Map((projects ?? []).map((p) => [p.id, p.departmentId]));
    const m = new Map<string, number>();
    for (const mt of meetings ?? []) {
      if (new Date(mt.date) < startOfToday) continue;
      const dept = mt.projectId ? projDept.get(mt.projectId) : null;
      if (dept) m.set(dept, (m.get(dept) ?? 0) + 1);
    }
    return m;
  }, [meetings, projects]);

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      <header className="mb-4">
        <h1 className="font-display text-page-lg font-bold text-ink">Meetings</h1>
        <p className="mt-0.5 text-sm text-muted">
          Open a department, then a project, to schedule a meeting and review its history.
        </p>
      </header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-card bg-hover" />
          ))}
        </div>
      ) : (departments ?? []).length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">
          No departments yet — create one and its projects first, then schedule meetings here.
        </p>
      ) : (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {(departments ?? []).map((d) => {
            const upcoming = upcomingByDept.get(d.id) ?? 0;
            return (
              <Link key={d.id} href={`/meetings/department/${d.id}`} className="card lift group block p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-card text-lg"
                    style={{ background: `color-mix(in srgb, ${d.color} 16%, transparent)` }}
                    aria-hidden
                  >
                    {d.icon ?? <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-section font-semibold text-ink">{d.name}</h2>
                    <p className="truncate text-micro text-muted">
                      {d.projectCount} project{d.projectCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </div>
                <div className="mt-3">
                  {upcoming > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-chip bg-primary-soft px-2 py-0.5 text-micro font-medium text-primary-ink">
                      <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      {upcoming} upcoming
                    </span>
                  ) : (
                    <span className="text-micro text-muted">No upcoming meetings</span>
                  )}
                </div>
              </Link>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
