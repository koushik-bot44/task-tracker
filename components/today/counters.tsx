"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { DashboardTodayDTO } from "@/lib/types";

const LEVEL_WORD: Record<DashboardTodayDTO["level"], string> = {
  company: "The company",
  department: "Your department",
  team: "Your team",
  mine: "Your work",
};

/**
 * The strip at the top of Today: seven numbers over what you run, each a
 * link into the Work list already filtered. Then the four ways in.
 */
export function Counters({ data }: { data: DashboardTodayDTO }) {
  const c = data.counters;
  const scope = data.level === "company" ? "" : data.level === "department" ? "&mine=department" : data.level === "team" ? "&mine=team" : "&mine=assigned";
  const tiles: { label: string; n: number; href: string; hot?: boolean }[] = [
    { label: "Open", n: c.open, href: `/work?f=open${scope}` },
    { label: "Nobody yet", n: c.unassigned, href: `/work?f=unassigned${scope}`, hot: c.unassigned > 0 && data.level !== "mine" },
    { label: "Late", n: c.overdue, href: `/work?f=overdue${scope}`, hot: c.overdue > 0 },
    { label: "Due today", n: c.dueToday, href: `/work?f=open&dueToday=1${scope}` },
    { label: "Waiting", n: c.waiting, href: `/work?f=waiting${scope}` },
    { label: "High priority", n: c.highPriority, href: `/work?f=high${scope}` },
    { label: "Resolved today", n: c.resolvedToday, href: `/work?f=finished${scope}` },
  ];
  const ways: { label: string; n: number; href: string }[] = [
    { label: "My work", n: data.myWorkTotal, href: "/work?mine=assigned" },
    ...(data.teams.length ? [{ label: "Team work", n: data.teamWorkTotal, href: "/work?mine=team" }] : []),
    ...(data.level === "company" || data.level === "department" ? [{ label: "Department work", n: data.departmentWorkTotal, href: "/work?mine=department&f=unassigned" }] : []),
    ...(data.everythingTotal !== null ? [{ label: "Everything", n: data.everythingTotal, href: "/work?view=departments" }] : []),
  ];
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-micro font-semibold uppercase tracking-wider text-muted">{LEVEL_WORD[data.level]}</h2>
      <Card className="grid grid-cols-4 gap-px overflow-hidden bg-line md:grid-cols-7">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="press flex flex-col items-start gap-0.5 bg-surface px-3 py-2.5">
            <span className={cn("text-section font-semibold tabular-nums", t.hot ? "text-danger-ink" : "text-ink")}>{t.n}</span>
            <span className="text-micro text-muted">{t.label}</span>
          </Link>
        ))}
      </Card>
      <div className="flex flex-wrap gap-2 px-1">
        {ways.map((w) => (
          <Link key={w.label} href={w.href} className="press inline-flex h-8 items-center gap-1.5 rounded-chip bg-hover px-3 text-micro font-medium text-ink">
            {w.label}
            <span className="tabular-nums text-muted">{w.n}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
