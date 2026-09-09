"use client";

import { ChevronDown, Paperclip, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { apiDelete, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dayInputValue } from "@/lib/dates";
import { useProjects } from "@/lib/hooks/use-projects";
import { useActivity, useWorkItem, useWorkMutations } from "@/lib/hooks/use-work";
import {
  WAITING_REASON_LABEL,
  WORK_PRIORITIES,
  WORK_PRIORITY_LABEL,
  WORK_STATE_LABEL,
  WORK_TYPE_LABEL,
  titleCase,
  type TaskDTO,
  type WorkPriority,
  type WorkState,
} from "@/lib/types";
import { TRANSITION_LABEL } from "@/lib/work/workflow";
import { ActivityStream } from "./activity-stream";
import { AttachmentViewer, type Attached } from "./attachment-viewer";
import { TaskFiles } from "./task-files";
import { FormRow, Panel, PanelHeader, Tabs, snButton, snInput, snLink, snPrimary } from "./sn";
import { AssignSheet, ConfirmSheet, MorePeopleSheet, WaitSheet } from "./work-sheets";

/** The moves on the button row, in order; the rest sit under "More". */
const PRIMARY: WorkState[] = ["IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED", "WAITING"];
const SECONDARY: WorkState[] = ["ESCALATED", "ASSIGNED", "NEW", "CANCELLED"];

function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * The record, laid out like a service-desk form: a title bar with the
 * number and the buttons this person may press; two columns of fields;
 * Short description and Description; then the Notes / Resolution
 * Information / Attachments tabs with the activity stream under Notes.
 */
export function WorkRecord({ number }: { number: string }) {
  const { data: task, isLoading, isError, error, refetch } = useWorkItem(number);
  if (isLoading) {
    return (
      <div className="w-full px-2 pb-8 pt-2 md:px-4" aria-busy>
        <Skeleton rows={5} />
      </div>
    );
  }
  if (isError || !task) {
    return (
      <div className="w-full px-2 pb-8 pt-2 md:px-4">
        {error instanceof Error && /not found/i.test(error.message) ? <EmptyState title="Record not found" body="It may have been deleted, or it may not be yours to see." /> : <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />}
      </div>
    );
  }
  return <RecordBody task={task} />;
}

type Tab = "notes" | "attachments";

function RecordBody({ task }: { task: TaskDTO }) {
  const router = useRouter();
  const access = task.access ?? { canEdit: false, canAssign: false, canDelete: false, staff: false, transitions: [] };
  const { transition, assign, update, remove } = useWorkMutations(task.id);
  const { data: projects } = useProjects();
  const { data: files, refetch: refetchFiles } = useActivity(task.id, { type: "ATTACHMENT,COMMENT,WORK_NOTE" });
  const withFiles = (files ?? []).filter((a) => a.attachmentUrl);
  const attachments: Attached[] = withFiles.map((a) => ({ url: a.attachmentUrl!, name: a.attachmentName, type: a.attachmentType }));
  const pinnedFiles = withFiles.filter((a) => a.pinnedAt);
  const project = task.projectId ? (projects ?? []).find((p) => p.id === task.projectId) ?? null : null;
  const { show: toast } = useToast();
  const [title, setTitle] = useState(task.title);
  const [describe, setDescribe] = useState(task.descriptionMd);
  const [tab, setTab] = useState<Tab>("notes");
  const [assignOpen, setAssignOpen] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [confirm, setConfirm] = useState<WorkState | "delete" | null>(null);
  const [viewing, setViewing] = useState<Attached | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePeopleOpen, setMorePeopleOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setDescribe(task.descriptionMd), [task.descriptionMd]);

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const move = (to: WorkState, extra: Record<string, unknown> = {}) => transition.mutate({ to, ...extra }, { onError: fail });
  const busy = transition.isPending || assign.isPending;
  // "Stop Work" keeps the holder; "Return to Queue" lets go. Stop Work only makes sense with a holder.
  const allowed = (list: WorkState[]) => list.filter((s) => access.transitions.includes(s)).filter((s) => !(s === "ASSIGNED" && !task.assigneeId));
  const moves = allowed(PRIMARY);
  const more = allowed(SECONDARY);
  const press = (to: WorkState) => {
    if (to === "WAITING") setWaitOpen(true);
    else if (to === "CANCELLED" || to === "REOPENED") setConfirm(to);
    else move(to);
  };
  const ro = !access.canEdit;
  /** The holder plus everyone else the same task went to. */
  const everyone = [
    ...(task.assigneeId && task.assigneeName ? [{ id: task.assigneeId, name: task.assigneeName }] : []),
    ...task.alsoWith,
  ];

  const takeOff = async (assigneeId: string, name: string) => {
    setSharing(true);
    try {
      await apiDelete(`/api/tasks/${task.id}/people`, { assigneeId });
      toast({ message: `${name} is off this task` });
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setSharing(false);
    }
  };

  const giveToMore = async (assigneeIds: string[]) => {
    setSharing(true);
    try {
      await apiPost(`/api/tasks/${task.id}/people`, { assigneeIds });
      setMorePeopleOpen(false);
      toast({ message: `Given to ${assigneeIds.length} more` });
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="w-full px-2 pb-8 pt-2 md:px-4">
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <Link href="/work" className={cn(snLink, "text-[13px] font-normal")}>Tasks</Link>
              <span className="text-muted">›</span>
              <span>{task.ref}</span>
              <span className="truncate font-normal text-muted">{task.title || "(empty)"}</span>
            </span>
          }
          right={
            <>
              <button type="button" onClick={() => setTab("attachments")} className={cn(snButton, "gap-1")} aria-label="Attachments">
                <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {attachments.length}
              </button>
              {moves.map((to, i) => (
                <button key={to} type="button" disabled={busy} onClick={() => press(to)} className={i === 0 ? snPrimary : snButton}>
                  {TRANSITION_LABEL[to]}
                </button>
              ))}
              {more.length || access.canDelete ? (
                <span className="relative">
                  <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-haspopup="menu" aria-expanded={moreOpen} className={snButton}>
                    More
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                  {moreOpen ? (
                    <>
                      <span className="fixed inset-0 z-sticky" onClick={() => setMoreOpen(false)} aria-hidden />
                      <ul role="menu" className="absolute right-0 top-9 z-drawer min-w-[12rem] border border-line bg-surface py-1 shadow-e2">
                        {more.map((to) => (
                          <li key={to}>
                            <button type="button" role="menuitem" disabled={busy} onClick={() => { setMoreOpen(false); press(to); }} className="press flex h-9 w-full items-center px-3 text-left text-[13px] text-ink hover:bg-hover">
                              {TRANSITION_LABEL[to]}
                            </button>
                          </li>
                        ))}
                        {access.canDelete ? (
                          <li>
                            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); setConfirm("delete"); }} className="press flex h-9 w-full items-center px-3 text-left text-[13px] text-danger-ink hover:bg-hover">
                              Delete
                            </button>
                          </li>
                        ) : null}
                      </ul>
                    </>
                  ) : null}
                </span>
              ) : null}
            </>
          }
        />

        <div className="grid grid-cols-1 gap-x-6 py-2 md:grid-cols-2">
          <div>
            <FormRow label="Number"><input value={task.ref} readOnly className={snInput} /></FormRow>
            {/* Who handed it over. On a task raised straight onto somebody they are
                the same person; when nobody was named yet, whoever raised it stands. */}
            <FormRow label="Assigned by"><input value={task.assignedByName ?? ""} readOnly className={snInput} /></FormRow>
            <FormRow label="Type"><input value={WORK_TYPE_LABEL[task.type]} readOnly className={snInput} /></FormRow>
            <FormRow label="Category"><input value={task.categoryName ?? ""} readOnly className={snInput} placeholder="—" /></FormRow>
            <FormRow label="Department"><input value={task.departmentName ?? ""} readOnly className={snInput} placeholder="—" /></FormRow>
            {project ? (
              <FormRow label="Project">
                <Link href={`/project/${project.slug}${task.parentId ? "" : `?task=${task.id}`}`} className={cn(snLink, "inline-flex h-8 items-center")}>
                  {project.name}
                </Link>
              </FormRow>
            ) : null}
          </div>
          <div>
            <FormRow label="State">
              <input value={`${WORK_STATE_LABEL[task.state]}${task.state === "WAITING" && task.waitingReason ? ` · ${WAITING_REASON_LABEL[task.waitingReason]}` : ""}`} readOnly className={snInput} />
            </FormRow>
            <FormRow label="Priority">
              <select value={task.priority} disabled={ro} onChange={(e) => update.mutate({ priority: e.target.value as WorkPriority }, { onError: fail })} className={snInput} aria-label="Priority">
                {WORK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {WORK_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Assignment group">
              <button type="button" disabled={!access.canAssign} onClick={() => setAssignOpen(true)} className={cn(snInput, "text-left", access.canAssign && "cursor-pointer")}>
                {task.assignmentGroupName ?? <span className="text-muted">—</span>}
              </button>
            </FormRow>
            <FormRow label={everyone.length > 1 ? `Assigned to (${everyone.length} people)` : "Assigned to"}>
              <div className="space-y-1.5">
                {/* This record's own holder — the one the buttons above act on. */}
                <button type="button" disabled={!access.canAssign} onClick={() => setAssignOpen(true)} className={cn(snInput, "text-left", access.canAssign && "cursor-pointer")}>
                  {task.assigneeName ?? <span className="text-muted">Nobody yet</span>}
                </button>

                {/* The same task given to several people is several records, so
                    the record names the others rather than pretending it is alone.
                    Each has their own copy, which is what the × takes away. */}
                {task.alsoWith.length ? (
                  <ul className="divide-y divide-line rounded-input border border-line">
                    {task.alsoWith.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 py-1 pl-3 pr-1">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.name}</span>
                        {access.canAssign ? (
                          <button
                            type="button"
                            onClick={() => void takeOff(p.id, p.name)}
                            disabled={sharing}
                            aria-label={`Take ${p.name} off this task`}
                            className="press grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:text-danger-ink disabled:opacity-40"
                          >
                            ×
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {access.canAssign ? (
                  <button type="button" onClick={() => setMorePeopleOpen(true)} className="press min-h-[32px] text-micro font-medium text-primary-ink">
                    + Give this to more people
                  </button>
                ) : null}
              </div>
            </FormRow>
            <FormRow label="Due date">
              <input type="date" disabled={ro} value={task.dueDate ? dayInputValue(new Date(task.dueDate)) : ""} onChange={(e) => update.mutate({ dueDate: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null }, { onError: fail })} className={snInput} aria-label="Due date" />
            </FormRow>
            <FormRow label="Opened"><input value={stamp(task.createdAt)} readOnly className={snInput} /></FormRow>
            <FormRow label="Updated"><input value={stamp(task.updatedAt)} readOnly className={snInput} /></FormRow>
          </div>
        </div>

        <div className="border-t border-line py-2">
          <FormRow label="Short description" required>
            <div className="flex items-center gap-1">
              <input
                value={title}
                readOnly={ro}
                onChange={(e) => setTitle(titleCase(e.target.value))}
                onBlur={() => { if (!ro && title.trim() !== task.title) update.mutate({ title: title.trim() }, { onError: fail }); }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                aria-label="Short description"
                className={snInput}
              />
              {access.canEdit ? (
                <button type="button" onClick={() => update.mutate({ important: !task.important }, { onError: fail })} aria-pressed={task.important} aria-label={task.important ? "Important — clear" : "Mark important"} className={cn("press grid h-8 w-8 shrink-0 place-items-center rounded-[3px] border border-line", task.important ? "text-warn-ink" : "text-muted")}>
                  <Star className="h-4 w-4" strokeWidth={1.75} fill={task.important ? "currentColor" : "none"} aria-hidden />
                </button>
              ) : null}
            </div>
          </FormRow>
          <FormRow label="Description">
            <textarea
              value={describe}
              readOnly={ro}
              onChange={(e) => setDescribe(e.target.value)}
              onBlur={() => { if (!ro && describe !== task.descriptionMd) update.mutate({ descriptionMd: describe }, { onError: fail }); }}
              rows={4}
              aria-label="Description"
              className={cn(snInput, "h-auto resize-y py-1.5")}
            />
          </FormRow>
          {pinnedFiles.length ? (
            <FormRow label="Pinned files">
              <ul className="flex flex-wrap gap-2">
                {pinnedFiles.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setViewing({ url: a.attachmentUrl!, name: a.attachmentName, type: a.attachmentType })}
                      title={a.body.trim() || undefined}
                      className="press flex min-h-[32px] max-w-[16rem] items-center gap-1.5 rounded-chip border border-line bg-surface px-2.5 text-[13px] text-ink hover:bg-hover"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden />
                      <span className="truncate">{a.attachmentName ?? "File"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </FormRow>
          ) : null}
        </div>

        <Tabs<Tab>
          tabs={[
            { value: "notes", label: "Notes" },
            { value: "attachments", label: "Attachments", count: attachments.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "notes" ? (
          <div className="p-3">
            <ActivityStream task={task} staff={access.staff} onOpenFile={setViewing} />
          </div>
        ) : (
          <div className="p-3">
            <TaskFiles
              taskId={task.id}
              files={withFiles}
              canPin={access.staff}
              onOpen={setViewing}
              onChanged={() => void refetchFiles()}
            />
          </div>
        )}
      </Panel>

      <MorePeopleSheet open={morePeopleOpen} onClose={() => setMorePeopleOpen(false)} task={task} already={everyone} busy={sharing} onAdd={(ids) => void giveToMore(ids)} />
      <AssignSheet open={assignOpen} onClose={() => setAssignOpen(false)} task={task} busy={assign.isPending} onAssign={(input) => assign.mutate(input, { onError: fail })} />
      <WaitSheet open={waitOpen} onClose={() => setWaitOpen(false)} busy={busy} onWait={(reason, note) => move("WAITING", { waitingReason: reason, waitingNote: note || null })} />
      <ConfirmSheet open={confirm === "CANCELLED"} onClose={() => setConfirm(null)} title="Cancel this task?" body="It stays on record as Canceled; nobody works on it any more." action="Cancel the task" tone="danger" onConfirm={() => move("CANCELLED")} />
      <ConfirmSheet open={confirm === "REOPENED"} onClose={() => setConfirm(null)} title="Reopen this task?" body="It goes back to whoever held it, and they are told." action="Reopen" onConfirm={() => move("REOPENED")} />
      <ConfirmSheet open={confirm === "delete"} onClose={() => setConfirm(null)} title="Delete this record?" body="It disappears from every list. The history is kept." action="Delete" tone="danger" onConfirm={() => remove.mutate(undefined, { onSuccess: () => router.push("/work"), onError: fail })} />
      <AttachmentViewer file={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
