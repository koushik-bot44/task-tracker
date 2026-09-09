"use client";

import { ChevronLeft, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateChip } from "@/components/ui/chip";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Face } from "@/components/ui/face";
import { inputClass } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { dayInputValue, shortDate } from "@/lib/dates";
import { useProjects } from "@/lib/hooks/use-projects";
import { useWorkItem, useWorkMutations } from "@/lib/hooks/use-work";
import {
  RESOLUTION_CODE_LABEL,
  WAITING_REASON_LABEL,
  WORK_PRIORITIES,
  WORK_PRIORITY_LABEL,
  WORK_TYPE_LABEL,
  type TaskDTO,
  type WorkPriority,
  type WorkState,
} from "@/lib/types";
import { TRANSITION_LABEL } from "@/lib/work/workflow";
import { ActivityStream } from "./activity-stream";
import { PriorityChip, StateChip, TypeChip } from "./work-chips";
import { AssignSheet, ConfirmSheet, ResolveSheet, WaitSheet } from "./work-sheets";

const ORDER: WorkState[] = ["IN_PROGRESS", "RESOLVED", "CLOSED", "WAITING", "REOPENED", "ESCALATED", "ASSIGNED", "NEW", "CANCELLED"];

/**
 * The record: work → who owns it → where it is → what happened → how it ended.
 *   header   number · state · priority · title
 *   who      requested by · team · assigned to
 *   moves    the buttons this person may press, nothing else
 *   details  type · department · due · project · milestone
 *   outcome  the resolution, once there is one
 *   activity the stream and the composer
 */
export function WorkRecord({ number }: { number: string }) {
  const { data: task, isLoading, isError, error, refetch } = useWorkItem(number);
  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4" aria-busy>
        <Skeleton rows={4} />
      </div>
    );
  }
  if (isError || !task) {
    return (
      <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4">
        {error instanceof Error && /not found/i.test(error.message) ? <EmptyState title="That task isn't here." body="It may have been deleted, or it may not be yours to see." /> : <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />}
      </div>
    );
  }
  return <RecordBody task={task} />;
}

function RecordBody({ task }: { task: TaskDTO }) {
  const router = useRouter();
  const access = task.access ?? { canEdit: false, canAssign: false, canDelete: false, staff: false, transitions: [] };
  const { transition, assign, update, remove } = useWorkMutations(task.id);
  const { data: projects } = useProjects();
  const project = task.projectId ? (projects ?? []).find((p) => p.id === task.projectId) ?? null : null;
  const { show: toast } = useToast();
  const [title, setTitle] = useState(task.title);
  const [describe, setDescribe] = useState(task.descriptionMd);
  const [assignOpen, setAssignOpen] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [confirm, setConfirm] = useState<WorkState | "delete" | null>(null);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setDescribe(task.descriptionMd), [task.descriptionMd]);

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const move = (to: WorkState, extra: Record<string, unknown> = {}) => transition.mutate({ to, ...extra }, { onError: fail });
  const busy = transition.isPending || assign.isPending;
  // ASSIGNED and NEW both read "Put back": offer the one that fits the holder.
  const moves = ORDER.filter((s) => access.transitions.includes(s)).filter((s) => !(s === "NEW" && task.assigneeId) && !(s === "ASSIGNED" && !task.assigneeId));

  const press = (to: WorkState) => {
    if (to === "WAITING") setWaitOpen(true);
    else if (to === "RESOLVED") setResolveOpen(true);
    else if (to === "CANCELLED" || to === "REOPENED") setConfirm(to);
    else move(to);
  };

  const finished = task.state === "RESOLVED" || task.state === "CLOSED" || task.state === "CANCELLED";

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-12 pt-3">
      <Link href="/work" className="press -ml-2 inline-flex h-9 items-center gap-1 rounded-chip px-2 text-micro font-medium text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        Work
      </Link>

      {/* Header */}
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-micro font-semibold tabular-nums text-muted">{task.ref}</span>
          <StateChip state={task.state} />
          <PriorityChip priority={task.priority} />
          <TypeChip type={task.type} />
          {task.state === "WAITING" && task.waitingReason ? <span className="text-micro text-muted">{WAITING_REASON_LABEL[task.waitingReason]}{task.waitingNote ? ` — ${task.waitingNote}` : ""}</span> : null}
        </div>
        <div className="flex items-start gap-1">
          {access.canEdit ? (
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
              onBlur={() => {
                if (title.trim() !== task.title) update.mutate({ title: title.trim() }, { onError: fail });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              rows={Math.max(1, Math.ceil(title.length / 34))}
              aria-label="Title"
              placeholder="Untitled"
              className={cn("min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-page font-semibold outline-none placeholder:text-muted", finished ? "text-muted" : "text-ink")}
            />
          ) : (
            <h1 className={cn("min-w-0 flex-1 px-1 py-1 text-page font-semibold", finished ? "text-muted" : "text-ink")}>{task.title || "Untitled"}</h1>
          )}
          {access.canEdit ? (
            <button
              type="button"
              onClick={() => update.mutate({ important: !task.important }, { onError: fail })}
              aria-pressed={task.important}
              aria-label={task.important ? "Important — tap to clear" : "Mark important"}
              className={cn("press grid h-11 w-11 shrink-0 place-items-center rounded-full", task.important ? "text-warn-ink" : "text-muted")}
            >
              <Star className="h-5 w-5" strokeWidth={1.75} fill={task.important ? "currentColor" : "none"} aria-hidden />
            </button>
          ) : null}
        </div>
        {access.canEdit ? (
          <textarea
            value={describe}
            onChange={(e) => setDescribe(e.target.value)}
            onBlur={() => {
              if (describe !== task.descriptionMd) update.mutate({ descriptionMd: describe }, { onError: fail });
            }}
            rows={describe ? Math.min(6, describe.split("\n").length + 1) : 1}
            placeholder="Say more about it…"
            aria-label="Description"
            className="w-full resize-none rounded-input bg-transparent px-1 py-1 text-sm text-ink outline-none placeholder:text-muted focus:bg-hover"
          />
        ) : task.descriptionMd ? (
          <p className="whitespace-pre-wrap break-words px-1 text-sm text-ink">{task.descriptionMd}</p>
        ) : null}
      </div>

      {/* Moves */}
      {moves.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {moves.map((to, i) => (
            <Button key={to} variant={i === 0 ? "primary" : to === "CANCELLED" ? "danger" : "secondary"} loading={busy && i === 0} disabled={busy} onClick={() => press(to)}>
              {TRANSITION_LABEL[to]}
            </Button>
          ))}
        </div>
      ) : null}

      {/* Who */}
      <Card className="mt-5 divide-y divide-line overflow-hidden">
        <Line label="Asked for by">{task.requesterName ? <Person name={task.requesterName} /> : <span className="text-muted">—</span>}</Line>
        <Line label="Team">{task.assignmentGroupName ?? <span className="text-muted">No team</span>}</Line>
        <Line label="Assigned to" action={access.canAssign ? <Button variant="quiet" onClick={() => setAssignOpen(true)}>Change</Button> : undefined}>
          {task.assigneeName ? <Person name={task.assigneeName} /> : <span className="text-muted">Nobody yet</span>}
        </Line>
      </Card>

      {/* Details */}
      <Card className="mt-3 divide-y divide-line overflow-hidden">
        <Line label="Department">{task.departmentName ?? <span className="text-muted">—</span>}</Line>
        {task.categoryName ? <Line label="Category">{task.categoryName}</Line> : null}
        <Line label="By when">
          {access.canEdit ? (
            <input
              type="date"
              value={task.dueDate ? dayInputValue(new Date(task.dueDate)) : ""}
              onChange={(e) => update.mutate({ dueDate: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null }, { onError: fail })}
              aria-label="By when"
              className={cn(inputClass, "h-9 w-auto")}
            />
          ) : (
            <DateChip iso={task.dueDate} status={task.status} />
          )}
        </Line>
        {access.canEdit ? (
          <Line label="How urgent">
            <div className="flex flex-wrap gap-1.5">
              {WORK_PRIORITIES.map((p) => (
                <button key={p} type="button" onClick={() => update.mutate({ priority: p as WorkPriority }, { onError: fail })} aria-pressed={task.priority === p} className={cn("press h-8 rounded-chip px-2.5 text-micro font-medium", task.priority === p ? "bg-ink text-on-ink" : "bg-hover text-muted")}>
                  {WORK_PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </Line>
        ) : (
          <Line label="How urgent">{WORK_PRIORITY_LABEL[task.priority]}</Line>
        )}
        {project ? (
          <Line label="Project">
            <Link href={`/project/${project.slug}${task.parentId ? "" : `?task=${task.id}`}`} className="font-medium text-primary-ink underline underline-offset-2">
              {project.name}
            </Link>
          </Line>
        ) : null}
        <Line label="Opened">{shortDate(task.createdAt)}</Line>
        {task.type !== "GENERAL" || project ? <Line label="Kind">{WORK_TYPE_LABEL[task.type]}</Line> : null}
      </Card>

      {/* Outcome */}
      {task.resolutionCode || task.resolvedAt || task.closedAt ? (
        <Card className="mt-3 divide-y divide-line overflow-hidden">
          <Line label="Resolution">{task.resolutionCode ? RESOLUTION_CODE_LABEL[task.resolutionCode] : "—"}</Line>
          {task.resolutionNotes ? <Line label="What was done">{task.resolutionNotes}</Line> : null}
          {task.rootCause ? <Line label="What caused it">{task.rootCause}</Line> : null}
          {task.resolvedByName && task.resolvedAt ? (
            <Line label="Resolved by">
              <Person name={task.resolvedByName} /> <span className="text-micro text-muted">· {shortDate(task.resolvedAt)}</span>
            </Line>
          ) : null}
          {task.closedAt ? <Line label={task.state === "CANCELLED" ? "Cancelled" : "Closed"}>{shortDate(task.closedAt)}</Line> : null}
        </Card>
      ) : null}

      {/* Activity */}
      <h2 className="mb-2 mt-6 px-1 text-section font-semibold text-ink">Activity</h2>
      <ActivityStream task={task} staff={access.staff} />

      {access.canDelete ? (
        <div className="mt-8 border-t border-line pt-4">
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />} onClick={() => setConfirm("delete")}>
            Delete
          </Button>
        </div>
      ) : null}

      <AssignSheet open={assignOpen} onClose={() => setAssignOpen(false)} task={task} busy={assign.isPending} onAssign={(input) => assign.mutate(input, { onError: fail })} />
      <WaitSheet open={waitOpen} onClose={() => setWaitOpen(false)} busy={busy} onWait={(reason, note) => move("WAITING", { waitingReason: reason, waitingNote: note || null })} />
      <ResolveSheet open={resolveOpen} onClose={() => setResolveOpen(false)} busy={busy} onResolve={(r) => move("RESOLVED", { resolutionCode: r.resolutionCode, resolutionNotes: r.resolutionNotes || null, rootCause: r.rootCause || null })} />
      <ConfirmSheet
        open={confirm === "CANCELLED"}
        onClose={() => setConfirm(null)}
        title="Cancel this task?"
        body="It stays in the records as cancelled; nobody works on it any more."
        action="Cancel the task"
        tone="danger"
        onConfirm={() => move("CANCELLED")}
      />
      <ConfirmSheet open={confirm === "REOPENED"} onClose={() => setConfirm(null)} title="Reopen this task?" body="It goes back to whoever held it, and they are told." action="Reopen" onConfirm={() => move("REOPENED")} />
      <ConfirmSheet
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="Delete this task?"
        body="It disappears from every list. The record is kept."
        action="Delete"
        tone="danger"
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => router.push("/work"), onError: fail })}
      />
    </div>
  );
}

function Line({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <span className="w-28 shrink-0 text-micro font-medium text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-ink">{children}</span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}

function Person({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Face name={name} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  );
}
