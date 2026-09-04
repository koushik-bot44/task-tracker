import Link from "next/link";
import type { TodayDTO } from "@/lib/types";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const linkClass = "rounded-md underline decoration-guide underline-offset-[3px] hover:text-ink";

/** "12 projects · 2 behind · 3 reviews this week" — the company in one line. */
export function SummaryLine({ summary }: { summary: NonNullable<TodayDTO["summary"]> }) {
  return (
    <p className="px-1 text-sm text-muted">
      {count(summary.projects, "project", "projects")}
      <span aria-hidden> · </span>
      <Link href="/projects" className={linkClass}>
        {summary.behind} behind
      </Link>
      <span aria-hidden> · </span>
      <Link href="/calendar" className={linkClass}>
        {count(summary.reviewsThisWeek, "review", "reviews")} this week
      </Link>
    </p>
  );
}
