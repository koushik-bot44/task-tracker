/**
 * The event layer (work model, 2026-09-09). A service says WHAT happened;
 * this file decides WHO hears about it and HOW loud:
 *
 *   bell      a row in the bell only
 *   push      bell + push
 *   message   bell + push + email + WhatsApp (the full "message" tier)
 *
 * Routes never call the delivery engines themselves. Every row carries the
 * task and a dedupe key, so a retried save cannot notify twice.
 */
import { prisma } from "@/lib/prisma";
import { bellUsers, notifyUsers, sendMessage } from "@/lib/notify";
import { taskGivenMessage, taskNoteMessage, taskResolvedMessage } from "@/lib/messages";
import { RESOLUTION_CODE_LABEL, WAITING_REASON_LABEL, WORK_PRIORITY_LABEL, WORK_STATE_LABEL, workRef } from "@/lib/types";
import type { WorkPriority, WorkState, WaitingReason, ResolutionCode } from "@prisma/client";

export type WorkEventType =
  | "TASK_CREATED"
  | "TASK_ASSIGNED"
  | "TASK_REASSIGNED"
  | "TASK_UNASSIGNED"
  | "COMMENT_ADDED"
  | "WORK_NOTE_ADDED"
  | "MENTIONED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "TASK_ESCALATED"
  | "TASK_RESOLVED"
  | "TASK_CLOSED"
  | "TASK_REOPENED"
  | "TASK_CANCELLED";

export type EventTask = {
  id: string;
  number: number;
  type: import("@prisma/client").WorkType;
  title: string;
  state: WorkState;
  priority: WorkPriority;
  dueDate: Date | null;
  assigneeId: string | null;
  requesterId: string | null;
  givenById: string | null;
  assignmentGroupId: string | null;
  departmentId: string | null;
  projectId: string | null;
  waitingReason: WaitingReason | null;
  resolutionCode: ResolutionCode | null;
  resolutionNotes: string | null;
};

export type WorkEvent = {
  type: WorkEventType;
  task: EventTask;
  actor: { id: string; name: string } | null;
  /** The activity row this came from — the dedupe identity. */
  activityId: string;
  payload?: {
    previousAssigneeId?: string | null;
    from?: WorkState;
    to?: WorkState;
    previousPriority?: WorkPriority;
    mentions?: string[];
    body?: string;
  };
};

async function audience(task: EventTask): Promise<{ groupLead: string | null; hod: string | null; projectName: string | null }> {
  const [group, dept, project] = await Promise.all([
    task.assignmentGroupId ? prisma.assignmentGroup.findUnique({ where: { id: task.assignmentGroupId }, select: { leadId: true } }) : null,
    task.departmentId ? prisma.department.findUnique({ where: { id: task.departmentId }, select: { hodId: true } }) : null,
    task.projectId ? prisma.project.findUnique({ where: { id: task.projectId }, select: { name: true } }) : null,
  ]);
  return { groupLead: group?.leadId ?? null, hod: dept?.hodId ?? null, projectName: project?.name ?? null };
}

const without = (ids: (string | null | undefined)[], ...drop: (string | null | undefined)[]) =>
  [...new Set(ids.filter((x): x is string => Boolean(x)))].filter((id) => !drop.includes(id));

/** Route one event. Never throws out: a dead channel must not fail the save. */
export async function emit(ev: WorkEvent): Promise<void> {
  try {
    await route(ev);
  } catch (err) {
    console.error(`[work/events] ${ev.type} failed:`, (err as Error).message);
  }
}

async function route(ev: WorkEvent): Promise<void> {
  const t = ev.task;
  const ref = workRef(t.type, t.number);
  const url = `/work/${t.number}`;
  const actorId = ev.actor?.id ?? null;
  const who = ev.actor?.name ?? "Orbit";
  const key = (kind: string) => `${kind}:${t.id}:${ev.activityId}`;
  const base = { url, taskId: t.id };

  switch (ev.type) {
    case "TASK_CREATED": {
      const a = await audience(t);
      if (!t.assigneeId && a.groupLead) {
        await notifyUsers(without([a.groupLead], actorId), {
          ...base,
          type: "work.created",
          title: `New for your team: ${ref}`,
          body: `${t.title} · ${who}`,
          tag: `task-${t.id}`,
          dedupeKey: key("created"),
        });
      }
      if (t.requesterId && t.requesterId !== actorId) {
        await bellUsers([t.requesterId], { ...base, type: "work.created", title: `${who} opened ${ref} for you`, body: t.title, dedupeKey: key("created-req") });
      }
      return;
    }
    case "TASK_ASSIGNED":
    case "TASK_REASSIGNED": {
      const a = await audience(t);
      if (t.assigneeId && t.assigneeId !== actorId) {
        await sendMessage(
          [t.assigneeId],
          taskGivenMessage({ taskId: t.id, taskRef: ref, taskNumber: t.number, taskTitle: t.title, projectName: a.projectName, giverName: who, dueDate: t.dueDate, handoverId: ev.activityId }),
        );
      }
      const prev = ev.payload?.previousAssigneeId;
      if (prev && prev !== t.assigneeId && prev !== actorId) {
        await bellUsers([prev], { ...base, type: "work.reassigned", title: `${ref} is no longer yours`, body: `${who} gave ${t.title} to someone else`, dedupeKey: key("no-longer") });
      }
      return;
    }
    case "TASK_UNASSIGNED": {
      const prev = ev.payload?.previousAssigneeId;
      if (prev && prev !== actorId) {
        await bellUsers([prev], { ...base, type: "work.reassigned", title: `${ref} is no longer yours`, body: `${who} took ${t.title} off your list`, dedupeKey: key("unassigned") });
      }
      return;
    }
    case "COMMENT_ADDED": {
      const mentions = ev.payload?.mentions ?? [];
      const ids = without([t.requesterId, t.assigneeId], actorId, ...mentions);
      const body = ev.payload?.body ?? "";
      if (ids.length) {
        await sendMessage(ids, taskNoteMessage({ taskId: t.id, taskRef: ref, taskNumber: t.number, taskTitle: t.title, authorName: who, body, activityId: ev.activityId }));
      }
      await mentioned(ev, ref, url, mentions, body.slice(0, 120));
      return;
    }
    case "WORK_NOTE_ADDED": {
      const a = await audience(t);
      const mentions = ev.payload?.mentions ?? [];
      const ids = without([t.assigneeId, a.groupLead], actorId, ...mentions);
      const snippet = (ev.payload?.body ?? "").slice(0, 120);
      await bellUsers(ids, { ...base, type: "work.team-note", title: `${who} left a team note on ${ref}`, body: snippet || t.title, dedupeKey: key("team-note") });
      await mentioned(ev, ref, url, mentions, snippet);
      return;
    }
    case "MENTIONED":
      await mentioned(ev, ref, url, ev.payload?.mentions ?? [], (ev.payload?.body ?? "").slice(0, 120));
      return;
    case "PRIORITY_CHANGED": {
      const raised = t.priority === "CRITICAL" || t.priority === "HIGH";
      if (raised && t.assigneeId && t.assigneeId !== actorId) {
        await notifyUsers([t.assigneeId], { ...base, type: "work.priority", title: `${ref} is now ${WORK_PRIORITY_LABEL[t.priority]}`, body: `${t.title} · ${who}`, tag: `task-${t.id}`, dedupeKey: key("priority") });
      }
      return;
    }
    case "STATUS_CHANGED":
    case "TASK_ESCALATED":
    case "TASK_RESOLVED":
    case "TASK_CLOSED":
    case "TASK_REOPENED":
    case "TASK_CANCELLED": {
      const to = ev.payload?.to ?? t.state;
      const a = await audience(t);
      const label = WORK_STATE_LABEL[to];
      switch (to) {
        case "RESOLVED":
          if (t.requesterId && t.requesterId !== actorId) {
            await sendMessage(
              [t.requesterId],
              taskResolvedMessage({
                taskId: t.id,
                taskRef: ref,
                taskNumber: t.number,
                taskTitle: t.title,
                resolverName: who,
                resolutionLabel: t.resolutionCode ? RESOLUTION_CODE_LABEL[t.resolutionCode] : "Resolved",
                resolutionNotes: t.resolutionNotes,
                activityId: ev.activityId,
              }),
            );
          }
          await bellUsers(without([t.assigneeId], actorId, t.requesterId), { ...base, type: "work.status", title: `${ref} resolved`, body: `${t.title} · ${who}`, dedupeKey: key("resolved") });
          return;
        case "CLOSED":
        case "CANCELLED":
          await bellUsers(without([t.requesterId, t.assigneeId], actorId), { ...base, type: "work.status", title: `${ref} ${label.toLowerCase()}`, body: `${t.title} · ${who}`, dedupeKey: key(to.toLowerCase()) });
          return;
        case "REOPENED":
          await notifyUsers(without([t.assigneeId, a.groupLead], actorId), { ...base, type: "work.status", title: `${ref} reopened`, body: `${t.title} · ${who}`, tag: `task-${t.id}`, dedupeKey: key("reopened") });
          return;
        case "WAITING": {
          const reason = t.waitingReason ? WAITING_REASON_LABEL[t.waitingReason] : label;
          if (t.waitingReason === "REQUESTER" && t.requesterId && t.requesterId !== actorId) {
            await notifyUsers([t.requesterId], { ...base, type: "work.status", title: `${ref} is waiting on you`, body: `${t.title} · ${who}`, tag: `task-${t.id}`, dedupeKey: key("waiting") });
          } else {
            await bellUsers(without([t.requesterId, t.assigneeId], actorId), { ...base, type: "work.status", title: `${ref}: ${reason}`, body: `${t.title} · ${who}`, dedupeKey: key("waiting") });
          }
          return;
        }
        case "ESCALATED":
          await notifyUsers(without([a.groupLead, a.hod], actorId), { ...base, type: "work.status", title: `${ref} escalated`, body: `${t.title} · ${who}`, tag: `task-${t.id}`, dedupeKey: key("escalated") });
          return;
        case "IN_PROGRESS":
          await bellUsers(without([t.requesterId], actorId, t.assigneeId), { ...base, type: "work.status", title: `${ref} started`, body: `${t.title} · ${who}`, dedupeKey: key("started") });
          return;
        default:
          return;
      }
    }
  }
}

async function mentioned(ev: WorkEvent, ref: string, url: string, mentions: string[], snippet: string): Promise<void> {
  const ids = without(mentions, ev.actor?.id);
  if (ids.length === 0) return;
  await notifyUsers(ids, {
    url,
    taskId: ev.task.id,
    type: "work.mention",
    title: `${ev.actor?.name ?? "Someone"} mentioned you on ${ref}`,
    body: snippet || ev.task.title,
    tag: `task-${ev.task.id}`,
    dedupeKey: `mention:${ev.task.id}:${ev.activityId}`,
  });
}
