"use client";

import { ArrowRightLeft, ExternalLink, MessageSquare, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NotesThread } from "@/components/notes/notes-thread";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { DateChip, StatusChip } from "@/components/ui/chip";
import { Face } from "@/components/ui/face";
import { Check } from "@/components/ui/row";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { dayInputValue, dateWord, isoDaysFromNow } from "@/lib/dates";
import { useMilestones } from "@/lib/hooks/use-milestones";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { useProjectPeople, useProjects } from "@/lib/hooks/use-projects";
import { newTaskId, useTaskMutations, useTasks } from "@/lib/hooks/use-tasks";
import { useMe } from "@/lib/hooks/use-users";
import { isLeadOrAboveRole } from "@/lib/roles";
import { keyAtEnd } from "@/lib/order";
import { STATUS_STYLE } from "@/lib/status";
import { TASK_STATUSES, type TaskDTO, type TaskStatus } from "@/lib/types";

/**
 * The task drawer: title · Face (tap to hand it to someone else) · date chip ·
 * status pill · ★ · Steps (a checklist) · Result link · Comments (plain text,
 * no attachments). Every field writes as you leave it. Opened with ?task=<id>
 * from anywhere.
 */
export function TaskDrawer({ task }: { task: TaskDTO }) {
  const { data: me } = useMe();
  const { data: projects } = useProjects();
  const project = (projects ?? []).find((p) => p.id === task.projectId) ?? null;
  const { data: siblings } = useTasks(task.projectId);
  const { data: people } = useProjectPeople(task.projectId, true);
  const { data: milestones } = useMilestones(task.projectId);
  const { createTask, updateTask, deleteTask, restoreTask } = useTaskMutations({ kind: "project", projectId: task.projectId ?? "" });
  const { openTask, closeTask } = usePanelParams();
  const { show: toast } = useToast();

  const [title, setTitle] = useState(task.title);
  const [focused, setFocused] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultDraft, setResultDraft] = useState(task.deliverableUrl ?? "");
  const [stepDraft, setStepDraft] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  const [openStepNotes, setOpenStepNotes] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setTitle(task.title);
  }, [task.title, focused]);

  const patch = (data: Parameters<typeof updateTask.mutate>[0]["patch"], quiet = false) =>
    updateTask.mutate({ id: task.id, patch: data, quiet }, { onError: (e) => toast({ message: (e as Error).message, tone: "danger" }) });

  const steps = useMemo(() => (siblings ?? []).filter((t) => t.parentId === task.id && !t.deletedAt), [siblings, task.id]);
  const isStep = task.parentId !== null;
  const parent = isStep ? (siblings ?? []).find((t) => t.id === task.parentId) ?? null : null;
  const done = task.status === "DONE";
  const milestone = (milestones ?? []).find((m) => m.id === task.milestoneId) ?? null;

  const addStep = () => {
    const text = stepDraft.trim();
    if (!text) {
      setAddingStep(false);
      return;
    }
    const id = newTaskId();
    createTask.mutate({ id, parentId: task.id, orderKey: keyAtEnd(siblings ?? [], task.id), title: text, dueDate: task.dueDate, milestoneId: task.milestoneId });
    setStepDraft("");
  };

  const remove = () => {
    const doomed = [task, ...steps];
    deleteTask.mutate({ id: task.id, removed: doomed });
    if (task.parentId) openTask(task.parentId);
    else closeTask();
    toast({
      message: `Deleted "${task.title || "Untitled"}"`,
      action: { label: "Undo", onAction: () => restoreTask.mutate({ id: task.id, rows: doomed }) },
    });
  };

  return (
    <div className="space-y-6 px-4 pb-6">
      {parent ? (
        <button type="button" onClick={() => openTask(parent.id)} className="press -mb-3 rounded-chip bg-hover px-3 py-1 text-micro font-medium text-muted">
          ← {parent.title || "Untitled"}
        </button>
      ) : null}

      {/* Title + done */}
      <div className="flex items-start gap-2">
        <Check
          checked={done}
          onChange={(next) => patch({ status: next ? "DONE" : "TODO" })}
          label={done ? "Mark not done" : "Mark done"}
          className="-ml-2 mt-0.5"
          readOnly={!task.isPrivate && !isLeadOrAboveRole(me?.role)}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (title !== task.title) patch({ title }, true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Untitled"
          aria-label="Task title"
          size={1}
          className={cn("min-w-0 flex-1 bg-transparent px-1 py-2 text-section font-semibold outline-none placeholder:text-muted", done ? "text-muted" : "text-ink")}
        />
        {!isStep ? (
          <button
            type="button"
            onClick={() => patch({ important: !task.important })}
            aria-pressed={task.important}
            aria-label={task.important ? "Important — tap to clear" : "Mark important"}
            className={cn("press grid h-11 w-11 shrink-0 place-items-center rounded-full", task.important ? "text-warn-ink" : "text-muted")}
          >
            <Star className="h-5 w-5" strokeWidth={1.75} fill={task.important ? "currentColor" : "none"} aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Who · when · status */}
      {!isStep ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setWhoOpen(true)} className="press flex h-9 items-center gap-2 rounded-chip bg-hover pl-1 pr-3 text-micro font-medium text-ink" aria-label="Who is doing this">
            {task.assigneeName ? <Face name={task.assigneeName} size="sm" /> : <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-muted" aria-hidden />}
            {task.assigneeName ?? "Nobody yet"}
          </button>
          <DateChip iso={task.dueDate} status={task.status} onClick={() => setWhenOpen(true)} />
          <StatusChip status={task.status} onClick={() => setStatusOpen(true)} />
          {project ? (
            <button type="button" onClick={() => setMoveOpen(true)} className="press flex h-7 items-center gap-1 rounded-chip bg-hover px-2.5 text-micro font-medium text-muted" aria-label="Move to another milestone">
              <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {milestone ? milestone.name : "No milestone"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={task.status} onClick={() => setStatusOpen(true)} />
        </div>
      )}

      {/* Steps */}
      {!isStep ? (
        <section>
          <h3 className="mb-1 text-micro font-medium text-muted">Steps{steps.length ? ` · ${steps.filter((s) => s.status === "DONE").length} of ${steps.length} done` : ""}</h3>
          <ul className="card divide-y divide-line">
            {steps.map((s) => (
              <li key={s.id}>
                <div className="flex min-h-[56px] items-center gap-1 pl-1 pr-2">
                  <Check checked={s.status === "DONE"} onChange={(next) => updateTask.mutate({ id: s.id, patch: { status: next ? "DONE" : "TODO" } })} label={s.title || "Step"} />
                  <button type="button" onClick={() => openTask(s.id)} className={cn("min-w-0 flex-1 truncate py-3 text-left text-row", s.status === "DONE" ? "text-muted" : "text-ink")}>
                    {s.title || <span className="italic text-muted">Untitled</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenStepNotes((v) => (v === s.id ? null : s.id))}
                    aria-label={`Notes on ${s.title || "this step"}`}
                    aria-expanded={openStepNotes === s.id}
                    className={cn("press grid h-11 w-11 shrink-0 place-items-center rounded-full", s.noteCount > 0 || openStepNotes === s.id ? "text-primary-ink" : "text-muted")}
                  >
                    <MessageSquare className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {s.noteCount > 0 ? <span className="sr-only">{s.noteCount} notes</span> : null}
                  </button>
                </div>
                {openStepNotes === s.id ? (
                  <div className="border-t border-line bg-bg px-3 py-3">
                    <NotesThread targetType="TASK" targetId={s.id} compact autoFocus attachments={false} placeholder="A note on this step…" />
                  </div>
                ) : null}
              </li>
            ))}
            <li>
              {addingStep ? (
                <div className="flex min-h-[56px] items-center gap-2 px-3">
                  <Plus className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
                  <input
                    value={stepDraft}
                    onChange={(e) => setStepDraft(e.target.value)}
                    onBlur={addStep}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addStep();
                        setAddingStep(true);
                      } else if (e.key === "Escape") {
                        setStepDraft("");
                        setAddingStep(false);
                      }
                    }}
                    placeholder="What's the step?"
                    aria-label="New step"
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent py-3 text-row text-ink outline-none placeholder:text-muted"
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setAddingStep(true)} className="press flex min-h-[56px] w-full items-center gap-2 px-3 text-left text-row text-primary-ink">
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Add a step
                </button>
              )}
            </li>
          </ul>
        </section>
      ) : null}

      {/* Result link */}
      {!isStep ? (
        <section>
          <h3 className="mb-1 text-micro font-medium text-muted">Result</h3>
          {task.deliverableUrl && !resultOpen ? (
            <div className="flex items-center gap-2">
              <a href={task.deliverableUrl} target="_blank" rel="noopener noreferrer" className="press flex h-11 min-w-0 flex-1 items-center gap-2 rounded-input bg-hover px-3 text-sm font-medium text-primary-ink">
                <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="truncate">{task.deliverableUrl.replace(/^https?:\/\//, "")}</span>
              </a>
              <Button variant="quiet" onClick={() => { setResultDraft(task.deliverableUrl ?? ""); setResultOpen(true); }}>
                Change
              </Button>
            </div>
          ) : resultOpen ? (
            <div className="flex items-center gap-2">
              <input
                value={resultDraft}
                onChange={(e) => setResultDraft(e.target.value)}
                placeholder="https://"
                inputMode="url"
                aria-label="Result link"
                autoFocus
                className={inputClass}
              />
              <Button
                variant="primary"
                onClick={() => {
                  const v = resultDraft.trim();
                  if (v && !/^https?:\/\/\S+$/i.test(v)) {
                    toast({ message: "Paste a link that starts with http:// or https://", tone: "danger" });
                    return;
                  }
                  patch({ deliverableUrl: v || null });
                  setResultOpen(false);
                }}
              >
                Save
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setResultOpen(true)} icon={<ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden />}>
              Add a link to the result
            </Button>
          )}
        </section>
      ) : null}

      {/* Comments — plain text, no camera, no paper-clip */}
      <section>
        <h3 className="mb-2 text-micro font-medium text-muted">Comments</h3>
        <NotesThread targetType="TASK" targetId={task.id} attachments={false} placeholder="Add a comment…" />
      </section>

      {/* Quiet actions */}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="danger" onClick={remove} icon={<Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />}>
          Delete
        </Button>
      </div>

      {/* Who? */}
      <Sheet open={whoOpen} onClose={() => setWhoOpen(false)} title="Who is doing this?">
        <ul className="divide-y divide-line">
          {(people ?? []).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  patch({ assigneeId: p.id });
                  setWhoOpen(false);
                }}
                className={cn("press flex min-h-[56px] w-full items-center gap-3 px-2 text-left", task.assigneeId === p.id && "bg-primary-soft")}
              >
                <Face name={p.name} />
                <span className="min-w-0 flex-1 truncate text-row text-ink">{p.id === me?.id ? `${p.name} (me)` : p.name}</span>
              </button>
            </li>
          ))}
          {(people ?? []).length === 0 ? <li className="py-6 text-center text-sm text-muted">Nobody is on this project yet.</li> : null}
        </ul>
      </Sheet>

      {/* By when? */}
      <Sheet open={whenOpen} onClose={() => setWhenOpen(false)} title="By when?">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { patch({ dueDate: isoDaysFromNow(0) }); setWhenOpen(false); }}>Today</Button>
            <Button variant="secondary" onClick={() => { patch({ dueDate: isoDaysFromNow(1) }); setWhenOpen(false); }}>Tomorrow</Button>
            {milestone ? (
              <Button variant="secondary" onClick={() => { patch({ dueDate: milestone.reviewDate }); setWhenOpen(false); }}>
                Review · {dateWord(milestone.reviewDate)}
              </Button>
            ) : null}
            <Button variant="quiet" onClick={() => { patch({ dueDate: null }); setWhenOpen(false); }}>No date</Button>
          </div>
          <Field label="Or pick a day">
            <input
              type="date"
              defaultValue={task.dueDate ? dayInputValue(new Date(task.dueDate)) : ""}
              onChange={(e) => {
                if (!e.target.value) return;
                patch({ dueDate: new Date(`${e.target.value}T00:00:00`).toISOString() });
                setWhenOpen(false);
              }}
              aria-label="Pick a day"
              className={inputClass}
            />
          </Field>
        </div>
      </Sheet>

      {/* Status */}
      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title="Where is it?">
        <ul className="divide-y divide-line">
          {TASK_STATUSES.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  patch({ status: s as TaskStatus });
                  setStatusOpen(false);
                }}
                className={cn("press flex min-h-[56px] w-full items-center gap-3 px-2 text-left", task.status === s && "bg-primary-soft")}
              >
                <span className={cn("h-3 w-3 rounded-full", STATUS_STYLE[s].dot)} aria-hidden />
                <span className="text-row text-ink">{STATUS_STYLE[s].label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      {/* Move to another milestone */}
      <Sheet open={moveOpen} onClose={() => setMoveOpen(false)} title="Move to…">
        <ul className="divide-y divide-line">
          {(milestones ?? []).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  patch({ milestoneId: m.id });
                  setMoveOpen(false);
                }}
                className={cn("press flex min-h-[56px] w-full items-center gap-3 px-2 text-left", task.milestoneId === m.id && "bg-primary-soft")}
              >
                <span className="min-w-0 flex-1 truncate text-row text-ink">{m.name}</span>
                <span className="text-micro text-muted">{dateWord(m.reviewDate)}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                patch({ milestoneId: null });
                setMoveOpen(false);
              }}
              className={cn("press flex min-h-[56px] w-full items-center gap-3 px-2 text-left", task.milestoneId === null && "bg-primary-soft")}
            >
              <span className="text-row text-muted">Not in a milestone yet</span>
            </button>
          </li>
        </ul>
      </Sheet>
    </div>
  );
}
