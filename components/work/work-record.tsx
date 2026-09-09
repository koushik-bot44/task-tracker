"use client";

import { Paperclip, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
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
import { FormRow, Panel, PanelHeader, Tabs, snButton, snInput, snLink, snPrimary } from "./sn";
import { AssignSheet, ConfirmSheet, WaitSheet } from "./work-sheets";

const ORDER: WorkState[] = ["IN_PROGRESS", "RESOLVED", "CLOSED", "WAITING", "REOPENED", "ESCALATED", "ASSIGNED", "NEW", "CANCELLED"];

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
  const { data: files } = useActivity(task.id, { type: "ATTACHMENT,COMMENT,WORK_NOTE" });
  const attachments: Attached[] = (files ?? []).filter((a) => a.attachmentUrl).map((a) => ({ url: a.attachmentUrl!, name: a.attachmentName, type: a.attachmentType }));
  const project = task.projectId ? (projects ?? []).find((p) => p.id === task.projectId) ?? null : null;
  const { show: toast } = useToast();
  const [title, setTitle] = useState(task.title);
  const [describe, setDescribe] = useState(task.descriptionMd);
  const [tab, setTab] = useState<Tab>("notes");
  const [assignOpen, setAssignOpen] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [confirm, setConfirm] = useState<WorkState | "delete" | null>(null);
  const [viewing, setViewing] = useState<Attached | null>(null);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setDescribe(task.descriptionMd), [task.descriptionMd]);

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });
  const move = (to: WorkState, extra: Record<string, unknown> = {}) => transition.mutate({ to, ...extra }, { onError: fail });
  const busy = transition.isPending || assign.isPending;
  // "Stop Work" keeps the holder; "Return to Queue" lets go. Stop Work only makes sense with a holder.
  const moves = ORDER.filter((s) => access.transitions.includes(s)).filter((s) => !(s === "ASSIGNED" && !task.assigneeId));
  const press = (to: WorkState) => {
    if (to === "WAITING") setWaitOpen(true);
    else if (to === "CANCELLED" || to === "REOPENED") setConfirm(to);
    else move(to);
  };
  const ro = !access.canEdit;

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
              {access.canDelete ? (
                <button type="button" onClick={() => setConfirm("delete")} className={cn(snButton, "text-danger-ink")}>
                  Delete
                </button>
              ) : null}
            </>
          }
        />

        <div className="grid grid-cols-1 gap-x-6 py-2 md:grid-cols-2">
          <div>
            <FormRow label="Number"><input value={task.ref} readOnly className={snInput} /></FormRow>
            <FormRow label="Requested by"><input value={task.requesterName ?? ""} readOnly className={snInput} /></FormRow>
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
            <FormRow label="Assigned to">
              <button type="button" disabled={!access.canAssign} onClick={() => setAssignOpen(true)} className={cn(snInput, "text-left", access.canAssign && "cursor-pointer")}>
                {task.assigneeName ?? <span className="text-muted">—</span>}
              </button>
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
            {attachments.length === 0 ? (
              <p className="text-[13px] text-muted">No attachments. Add one from the Notes tab with the paper-clip.</p>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-hover text-left text-muted">
                    <th className="border-b border-line px-3 py-2 font-semibold">File</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Type</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {(files ?? []).filter((a) => a.attachmentUrl).map((a) => (
                    <tr key={a.id} className="border-b border-line hover:bg-hover">
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => setViewing({ url: a.attachmentUrl!, name: a.attachmentName, type: a.attachmentType })} className={cn(snLink, "font-medium")}>
                          {a.attachmentName ?? "File"}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-muted">{a.attachmentType ?? ""}</td>
                      <td className="px-3 py-2 text-muted">{stamp(a.createdAt)} · {a.author?.name ?? "Someone who left"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Panel>

      <AssignSheet open={assignOpen} onClose={() => setAssignOpen(false)} task={task} busy={assign.isPending} onAssign={(input) => assign.mutate(input, { onError: fail })} />
      <WaitSheet open={waitOpen} onClose={() => setWaitOpen(false)} busy={busy} onWait={(reason, note) => move("WAITING", { waitingReason: reason, waitingNote: note || null })} />
      <ConfirmSheet open={confirm === "CANCELLED"} onClose={() => setConfirm(null)} title="Cancel this task?" body="It stays on record as Canceled; nobody works on it any more." action="Cancel the task" tone="danger" onConfirm={() => move("CANCELLED")} />
      <ConfirmSheet open={confirm === "REOPENED"} onClose={() => setConfirm(null)} title="Reopen this task?" body="It goes back to whoever held it, and they are told." action="Reopen" onConfirm={() => move("REOPENED")} />
      <ConfirmSheet open={confirm === "delete"} onClose={() => setConfirm(null)} title="Delete this record?" body="It disappears from every list. The history is kept." action="Delete" tone="danger" onConfirm={() => remove.mutate(undefined, { onSuccess: () => router.push("/work"), onError: fail })} />
      <AttachmentViewer file={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
