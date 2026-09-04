"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip, DeadlineChip } from "@/components/ui/chip";
import { Faces } from "@/components/ui/face";
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
 * One project as a card: its priority · its name · the faces on it (lead
 * first) · how far along (tasks done over tasks, worked out by the server) ·
 * when it is due · what comes next. The whole card opens the project. A
 * finished one reads muted.
 */
export function ProjectCard({ project }: { project: ProjectDTO }) {
  const reduce = useReducedMotion();
  const done = project.status === "DONE";
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
            <PriorityChip priority={project.priority} muted={done} />
            <span className={cn("min-w-0 flex-1 truncate text-row font-semibold", done ? "text-muted" : "text-ink")}>{project.name}</span>
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
            {done && !project.deadline ? <Chip tone="ok">Done</Chip> : <DeadlineChip deadline={project.deadline} done={done} />}
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
