"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DeadlineChip } from "@/components/ui/chip";
import { Faces } from "@/components/ui/face";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import type { ProjectDTO } from "@/lib/types";

/**
 * One project as a card: its name · the faces on it (lead first) · how far
 * along · when it is due · what comes next. The whole card opens the project.
 * A project that is behind wears a small red dot; a finished one reads muted.
 */
export function ProjectCard({ project }: { project: ProjectDTO }) {
  const reduce = useReducedMotion();
  const done = project.status === "DONE";
  const behind = project.behind && !done;
  const progress = Math.max(0, Math.min(100, Math.round(project.progress)));
  const names = project.people.map((p) => p.name);

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="list-none"
    >
      <Card className="overflow-hidden">
        <Link href={`/project/${project.slug}`} className="press block rounded-card p-4" aria-label={`Open ${project.name}`}>
          <div className="flex items-center gap-3">
            <span className={cn("min-w-0 flex-1 truncate text-row font-semibold", done ? "text-muted" : "text-ink")}>
              {behind ? (
                <>
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-danger align-middle" aria-hidden />
                  <span className="sr-only">Behind: </span>
                </>
              ) : null}
              {project.name}
            </span>
            <Faces names={names} max={3} />
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="How far along"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-hover"
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-200 ease-out", done ? "bg-guide" : "bg-primary")}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-micro tabular-nums text-muted">{progress}%</span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <DeadlineChip deadline={project.deadline} done={done} />
            <span className="min-w-0 flex-1 truncate text-micro text-muted">
              {project.nextMilestone
                ? `Next: ${project.nextMilestone.name} · ${dateWord(project.nextMilestone.reviewDate)}`
                : "No milestone yet"}
            </span>
          </div>
        </Link>
      </Card>
    </motion.li>
  );
}
