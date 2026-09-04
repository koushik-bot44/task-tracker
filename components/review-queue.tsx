"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FirstRunHint } from "@/components/first-run-hint";
import { NotesThread } from "@/components/notes-thread";
import { TaskTitle } from "@/components/task-title";
import { useToast } from "@/components/toast";
import { formatDMY } from "@/lib/dates";
import { apiGet, apiPatch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { VERIFIED_GATE_KEY } from "@/lib/gates";
import { useMe } from "@/lib/hooks/use-users";
import { useProjects } from "@/lib/hooks/use-projects";
import { isManagerRole } from "@/lib/roles";
import type { TaskDTO } from "@/lib/types";

type Ancestor = { id: string; title: string; parentId: string | null; projectId: string };
type ReviewPayload = {
  needsReview: TaskDTO[];
  recentlyReviewed: TaskDTO[];
  ancestors: Ancestor[];
};

const reviewKey = ["review"] as const;

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDMY(iso);
}

export function ReviewQueue() {
  const router = useRouter();
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const { data: me, isLoading: loadingMe } = useMe();
  const { data: projects } = useProjects();
  const [filter, setFilter] = useState<string | null>(null);

  // The Review queue is the sign-off surface — managers AND admins (phase 13).
  const canReview = isManagerRole(me?.role);

  useEffect(() => {
    if (!loadingMe && me && !isManagerRole(me.role)) router.replace("/");
  }, [loadingMe, me, router]);

  const { data, isLoading } = useQuery({
    queryKey: reviewKey,
    queryFn: () => apiGet<ReviewPayload>("/api/review"),
    enabled: canReview,
  });

  const markReviewed = useMutation({
    mutationFn: ({ task }: { task: TaskDTO }) => {
      const gates = task.gates.map((g) =>
        g.key === VERIFIED_GATE_KEY
          ? { ...g, done: true, at: new Date().toISOString() }
          : g,
      );
      return apiPatch<TaskDTO>(`/api/tasks/${task.id}`, { gates });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKey });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      toast({ message: "Marked verified" });
    },
    onError: (error) => toast({ message: (error as Error).message, tone: "danger" }),
  });

  const projectById = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p])),
    [projects],
  );

  const pathOf = useMemo(() => {
    const byId = new Map((data?.ancestors ?? []).map((a) => [a.id, a]));
    return (task: TaskDTO) => {
      const parts: string[] = [];
      let cursor = task.parentId ? byId.get(task.parentId) : undefined;
      let guard = 0;
      while (cursor && guard++ < 50) {
        parts.unshift(cursor.title || "Untitled");
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return parts.join(" › ");
    };
  }, [data?.ancestors]);

  if (loadingMe || !me || !canReview) return null;

  const apply = (rows: TaskDTO[]) =>
    filter === null ? rows : rows.filter((t) => t.projectId === filter);

  const needs = apply(data?.needsReview ?? []);
  const recent = apply(data?.recentlyReviewed ?? []);

  return (
    <div className="max-w-3xl px-4 py-4 sm:px-8 sm:py-6">
      <FirstRunHint id="review">
        Completed work lands here until a manager marks it verified.
      </FirstRunHint>

      <p className="text-sm text-muted">
        Work that is finished and waiting on your sign-off.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip active={filter === null} onClick={() => setFilter(null)} label="All projects" />
        {(projects ?? []).map((project) => (
          <Chip
            key={project.id}
            active={filter === project.id}
            onClick={() => setFilter(project.id)}
            label={project.name}
            color={project.color}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-hover" />
          ))}
        </div>
      ) : (
        <>
          <Section
            title="Needs review"
            count={needs.length}
            tone="warn"
            empty="Nothing waiting. "
          >
            {needs.map((task) => (
              <Row
                key={task.id}
                task={task}
                path={pathOf(task)}
                color={projectById.get(task.projectId ?? "")?.color}
                toolName={projectById.get(task.projectId ?? "")?.name}
                action={
                  <button
                    type="button"
                    onClick={() => markReviewed.mutate({ task })}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-micro font-medium text-on-primary transition-opacity duration-150 ease-out hover:opacity-90"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    Mark verified
                  </button>
                }
              />
            ))}
          </Section>

          <Section
            title="Recently verified"
            count={recent.length}
            tone="primary"
            empty="Nothing signed off yet."
          >
            {recent.map((task) => (
              <Row
                key={task.id}
                task={task}
                path={pathOf(task)}
                color={projectById.get(task.projectId ?? "")?.color}
                toolName={projectById.get(task.projectId ?? "")?.name}
                action={<ReviewedLabel task={task} />}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  empty,
  children,
}: {
  title: string;
  count: number;
  tone: "warn" | "primary";
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 px-1 pb-1.5 text-micro font-medium uppercase tracking-widest text-muted">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "warn" ? "bg-warn" : "bg-primary",
          )}
          aria-hidden
        />
        {title}
        <span className="tabular-nums">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="px-1 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

/**
 * One review row, in one shape.
 *
 * Both sections used to render structurally different rows: "Needs review" had
 * two lines and a wide blue button, "Recently reviewed" had three lines and no
 * action at all, so heights and right edges did not line up down the page. The
 * row is a three-column grid now — a fixed dot gutter, a content column, and a
 * fixed-width action slot — and BOTH variants use it. The only difference is
 * what sits in the action slot, and the slot is the same size either way.
 *
 * The content column is one left edge for all three lines. Line 1 is always
 * present (tool, then the ancestor path when there is one), so every row is
 * the same height whether or not the task is nested.
 */
/**
 * The quiet counterpart to "Mark reviewed". It occupies the same slot so the
 * two sections line up; it is a label, not a button, because there is nothing
 * left to do to a row that has been signed off.
 */
function ReviewedLabel({ task }: { task: TaskDTO }) {
  const gate = task.gates.find((g) => g.key === VERIFIED_GATE_KEY);
  const when = gate?.at ? relativeTime(gate.at) : null;
  return (
    <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-micro font-medium text-ok-ink">
      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      Reviewed{when ? ` · ${when}` : ""}
    </span>
  );
}

function Row({
  task,
  path,
  color,
  toolName,
  action,
}: {
  task: TaskDTO;
  path: string;
  color?: string;
  toolName?: string;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  const where = [toolName, path].filter(Boolean).join(" › ");

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-[0.75rem_1fr] items-start gap-x-3 p-3 sm:grid-cols-[0.75rem_1fr_auto] sm:items-center">
        {/* Dot gutter: fixed width, so the content edge is identical on every
            row regardless of what the dot is doing. Centred against the row on
            desktop; on the first text line when the actions wrap below. */}
        <span className="flex h-5 items-center justify-center sm:h-full">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color ?? "var(--muted)" }}
            aria-hidden
          />
        </span>

        {/* One left edge for all three lines. */}
        <div className="min-w-0">
          <p className="truncate text-micro text-muted">{where || " "}</p>
          <p className="truncate text-sm text-ink">
            <TaskTitle title={task.title} />
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-muted">
            {task.completedByName ? <span>{task.completedByName}</span> : null}
            {task.completedByName && task.completedAt ? (
              <span aria-hidden>·</span>
            ) : null}
            {task.completedAt ? <span>{relativeTime(task.completedAt)}</span> : null}
          </p>
        </div>

        {/* Action slot. Same width in both variants so the right edge does not
            shuffle between sections. Wraps under the content on a phone —
            identity keeps its line, per the structural rule. */}
        <div className="col-start-2 mt-2 flex flex-wrap items-center justify-start gap-2 sm:col-start-3 sm:mt-0 sm:w-[17.5rem] sm:flex-nowrap sm:justify-end">
          {task.deliverableUrl ? (
            <a
              href={task.deliverableUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 text-micro font-medium text-primary-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Deliverable
            </a>
          ) : (
            /* An absent link is an absent state, not a value. Quieter than the
               metadata around it so the eye skips it. */
            <span className="shrink-0 text-micro font-normal text-muted opacity-70">
              No link
            </span>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="press flex h-8 shrink-0 items-center gap-1 rounded-lg bg-hover px-2.5 text-micro text-muted hover:text-ink"
          >
            Notes
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-150 ease-out",
                open && "rotate-180",
              )}
              strokeWidth={2}
              aria-hidden
            />
          </button>

          {action}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-line"
          >
            <div className="p-3">
              <NotesThread taskId={task.id} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function Chip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-chip px-3 text-micro transition-colors duration-150 ease-out",
        active
          ? "bg-primary-soft font-medium text-primary-ink"
          : "bg-hover text-muted hover:text-ink",
      )}
    >
      {color ? (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      ) : null}
      {label}
    </button>
  );
}
