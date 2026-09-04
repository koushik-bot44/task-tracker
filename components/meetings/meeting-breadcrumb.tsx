"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { cn } from "@/lib/cn";

/** Meetings ▸ Department ▸ Project. Non-last crumbs link up; the current one is
    a bold non-link (phase 22). */
export function MeetingBreadcrumb({ crumbs }: { crumbs: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
            ) : null}
            {c.href && !last ? (
              <Link
                href={c.href}
                className="press max-w-[14rem] truncate rounded px-1 py-0.5 text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={cn("max-w-[16rem] truncate px-1", last ? "font-semibold text-ink" : "text-muted")}
                aria-current={last ? "page" : undefined}
              >
                {c.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
