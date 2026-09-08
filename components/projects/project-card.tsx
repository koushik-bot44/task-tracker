"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Pin } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { Card } from "@/components/ui/card";
import { Chip, DeadlineChip } from "@/components/ui/chip";
import { Faces } from "@/components/ui/face";
import { ProjectMark } from "@/components/ui/project-mark";
import { cn } from "@/lib/cn";
import { dateWord } from "@/lib/dates";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import { useMe } from "@/lib/hooks/use-users";
import { isExecutiveRole } from "@/lib/roles";
import { PROJECT_PRIORITY_LABEL, type ProjectDTO, type ProjectPriorityValue } from "@/lib/types";

/**
 * May this person pin the project to the top of its department? The people who
 * run it: the CEO, the head of its department, or its owner. Deliberately
 * light — a card list must not fire a query per card; a member marked
 * "can manage" pins from the project itself, and the server decides either way.
 */
function useCanPin(project: ProjectDTO): boolean {
  const { data: me } = useMe();
  const { data: departments } = useDepartments();
  if (!me) return false;
  if (isExecutiveRole(me.role)) return true;
  if (project.ownerId === me.id) return true;
  if (me.role === "HOD") return (departments ?? []).some((d) => d.id === project.departmentId && d.hodId === me.id);
  return false;
}

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
  const canPin = useCanPin(project);
  const { updateProject } = useProjectMutations();
  const { show: toast } = useToast();
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
      <Card className="relative overflow-hidden">
        {canPin ? (
          <button
            type="button"
            onClick={() =>
              updateProject.mutate(
                { id: project.id, patch: { pinned: !project.pinned } },
                {
                  onSuccess: () => toast({ message: project.pinned ? `${project.name} unpinned` : `${project.name} pinned to the top` }),
                  onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
                },
              )
            }
            aria-pressed={project.pinned}
            aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name} to the top`}
            title={project.pinned ? "Unpin" : "Pin to the top"}
            className={cn(
              "press absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full",
              project.pinned ? "text-primary-ink" : "text-muted hover:text-ink",
            )}
          >
            {project.pinned ? <Pin className="h-4 w-4" strokeWidth={2} fill="currentColor" aria-hidden /> : <Pin className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          </button>
        ) : null}
        <Link href={`/project/${project.slug}`} className="press block rounded-card p-4" aria-label={`Open ${project.name}`}>
          <div className="flex items-start gap-3">
            <ProjectMark name={project.name} color={project.color} icon={project.icon} logoUrl={project.logoUrl} className={cn(done && "opacity-60")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-row font-semibold", done ? "text-muted" : "text-ink")}>{project.name}</span>
                <PriorityChip priority={project.priority} muted={done} className={canPin ? "mr-9" : undefined} />
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
