"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip, DeadlineChip } from "@/components/ui/chip";
import { Faces } from "@/components/ui/face";
import { ProjectMark } from "@/components/ui/project-mark";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import { PROJECT_PRIORITY_LABEL, type ProjectDTO, type ProjectPriorityValue } from "@/lib/types";

/**
 * P1 / P2 / P3 as a small chip. P1 is tinted so it is found first; P2 reads
 * plain; P3 reads muted. A finished project's chip reads muted whatever it
 * says. With `onClick` it becomes a button (the project page uses it to open
 * the priority sheet).
 */
export function PriorityChip({
  priority,
  muted = false,
  onClick,
  className,
}: {
  priority: ProjectPriorityValue;
  muted?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const label = PROJECT_PRIORITY_LABEL[priority];
  const tone = !muted && label === "P1" ? "primary" : "neutral";
  return (
    <Chip tone={tone} onClick={onClick} className={cn(!muted && label === "P2" && "text-ink", className)} title={onClick ? "Change priority" : undefined}>
      <span className="sr-only">Priority: </span>
      {label}
    </Chip>
  );
}

/**
 * One project as a card (owner, 2026-09-04: "make the projects section good
 * looking"): its mark (logo, or icon on its colour) · its name with the
 * priority beside it · the faces on it · when it is due and what comes next ·
 * how far along, as a bar with its number. The whole card opens the project.
 * A finished one reads muted.
 */
export function ProjectCard({ project }: { project: ProjectDTO }) {
  const reduce = useReducedMotion();
  const done = project.status === "DONE";
  const behind = project.behind && !done;
  const progress = Math.max(0, Math.min(100, Math.round(project.progress)));
  const names = project.people.map((p) => p.name);
  const next = project.nextMilestone;

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="list-none"
    >
      <Card className="overflow-hidden">
        <Link href={`/project/${project.slug}`} className="press block rounded-card p-4" aria-label={`Open ${project.name}`}>
          <div className="flex items-start gap-3">
            <ProjectMark name={project.name} color={project.color} icon={project.icon} logoUrl={project.logoUrl} className={cn(done && "opacity-60")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-row font-semibold", done ? "text-muted" : "text-ink")}>{project.name}</span>
                <PriorityChip priority={project.priority} muted={done} />
              </div>
              <div className="mt-1 flex items-center gap-2">
                {done && !project.deadline ? <Chip tone="ok">Done</Chip> : <DeadlineChip deadline={project.deadline} done={done} />}
                <span className={cn("min-w-0 flex-1 truncate text-micro", behind ? "text-danger-ink" : "text-muted")}>
                  {behind ? "Behind" : next ? `Next: ${next.name} · ${dateWord(next.reviewDate)}` : done ? "Finished" : "No milestone yet"}
                  {behind && next ? ` · Next: ${next.name} · ${dateWord(next.reviewDate)}` : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Faces names={names} max={4} size="sm" />
            <div
              role="progressbar"
              aria-label="How far along"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hover"
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-200 ease-out", done ? "bg-guide" : "bg-primary")}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-micro font-medium tabular-nums text-ink">{progress}%</span>
          </div>
        </Link>
      </Card>
    </motion.li>
  );
}
