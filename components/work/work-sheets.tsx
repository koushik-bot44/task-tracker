"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Face } from "@/components/ui/face";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useGroups } from "@/lib/hooks/use-work";
import { useProjectPeople } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canSeeUserListRole } from "@/lib/roles";
import {
  RESOLUTION_CODES,
  RESOLUTION_CODE_LABEL,
  WAITING_REASONS,
  WAITING_REASON_LABEL,
  type ResolutionCode,
  type TaskDTO,
  type WaitingReason,
} from "@/lib/types";

/**
 * Who holds it: pick a team, then a person on it. With no team the people
 * come from the project (or the whole list for a lead). "No one" clears it.
 */
export function AssignSheet({
  open,
  onClose,
  task,
  onAssign,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  task: TaskDTO;
  onAssign: (input: { assignmentGroupId?: string | null; assigneeId?: string | null }) => void;
  busy?: boolean;
}) {
  const { data: me } = useMe();
  const { data: groups } = useGroups(open);
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));
  const { data: projectPeople } = useProjectPeople(task.projectId, open && Boolean(task.projectId));
  const [groupId, setGroupId] = useState<string | null>(task.assignmentGroupId);
  useEffect(() => {
    if (open) setGroupId(task.assignmentGroupId);
  }, [open, task.assignmentGroupId]);

  const group = (groups ?? []).find((g) => g.id === groupId) ?? null;
  const people = useMemo(() => {
    if (group) return group.members;
    if (task.projectId) return (projectPeople ?? []).map((p) => ({ id: p.id, name: p.name }));
    const list = (users ?? []).filter((u) => u.role !== "ADMIN" && u.role !== "PERSON" && u.status === "ACTIVE" && !u.disabledAt).map((u) => ({ id: u.id, name: u.name }));
    return list.length || !me ? list : [{ id: me.id, name: me.name }];
  }, [group, task.projectId, projectPeople, users, me]);

  return (
    <Sheet open={open} onClose={onClose} title="Who is doing this?">
      <div className="space-y-4">
        {(groups ?? []).length ? (
          <Field label="Team">
            <select value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value || null)} className={inputClass} aria-label="Team">
              <option value="">No team</option>
              {(groups ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.departmentName} · {g.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onAssign({ assignmentGroupId: groupId, assigneeId: p.id });
                  onClose();
                }}
                className={cn("press flex min-h-[56px] w-full items-center gap-3 px-2 text-left", task.assigneeId === p.id && "bg-primary-soft")}
              >
                <Face name={p.name} />
                <span className="min-w-0 flex-1 truncate text-row text-ink">{p.id === me?.id ? `${p.name} (me)` : p.name}</span>
              </button>
            </li>
          ))}
          {people.length === 0 ? <li className="py-6 text-center text-sm text-muted">{group ? "Nobody is on this team yet." : "Nobody to pick from."}</li> : null}
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onAssign({ assignmentGroupId: groupId, assigneeId: null });
                onClose();
              }}
              className={cn("press flex min-h-[56px] w-full items-center gap-3 px-2 text-left", task.assigneeId === null && "bg-primary-soft")}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-muted" aria-hidden />
              <span className="text-row text-muted">No one{group ? ` — leave it with ${group.name}` : ""}</span>
            </button>
          </li>
        </ul>
      </div>
    </Sheet>
  );
}

/** Waiting always says what for. */
export function WaitSheet({ open, onClose, onWait, busy = false }: { open: boolean; onClose: () => void; onWait: (reason: WaitingReason, note: string) => void; busy?: boolean }) {
  const [reason, setReason] = useState<WaitingReason>("REQUESTER");
  const [note, setNote] = useState("");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Waiting for what?"
      footer={
        <Button variant="primary" full loading={busy} onClick={() => { onWait(reason, note.trim()); onClose(); }}>
          Mark as waiting
        </Button>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-line">
          {WAITING_REASONS.map((r) => (
            <li key={r}>
              <button type="button" onClick={() => setReason(r)} className={cn("press flex min-h-[48px] w-full items-center px-2 text-left text-row text-ink", reason === r && "bg-primary-soft")}>
                {WAITING_REASON_LABEL[r]}
              </button>
            </li>
          ))}
        </ul>
        <Field label="A word on it (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="What exactly are we waiting on?" />
        </Field>
      </div>
    </Sheet>
  );
}

/** Resolved always says how. */
export function ResolveSheet({ open, onClose, onResolve, busy = false }: { open: boolean; onClose: () => void; onResolve: (input: { resolutionCode: ResolutionCode; resolutionNotes: string; rootCause: string }) => void; busy?: boolean }) {
  const [code, setCode] = useState<ResolutionCode>("COMPLETED");
  const [notes, setNotes] = useState("");
  const [rootCause, setRootCause] = useState("");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How was it resolved?"
      footer={
        <Button variant="primary" full loading={busy} onClick={() => { onResolve({ resolutionCode: code, resolutionNotes: notes.trim(), rootCause: rootCause.trim() }); onClose(); }}>
          Resolve
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {RESOLUTION_CODES.map((c) => (
            <button key={c} type="button" onClick={() => setCode(c)} className={cn("press h-9 rounded-chip px-3 text-micro font-medium", code === c ? "bg-primary text-on-primary" : "bg-hover text-ink")}>
              {RESOLUTION_CODE_LABEL[c]}
            </button>
          ))}
        </div>
        <Field label="What was done">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={cn(inputClass, "h-auto py-2.5")} placeholder="Restarted the access point and corrected the settings." />
        </Field>
        <Field label="What caused it (optional)">
          <input value={rootCause} onChange={(e) => setRootCause(e.target.value)} className={inputClass} placeholder="A corrupted configuration." />
        </Field>
      </div>
    </Sheet>
  );
}

/** One question, one button. */
export function ConfirmSheet({ open, onClose, title, body, action, tone = "primary", onConfirm, busy = false }: { open: boolean; onClose: () => void; title: string; body?: string; action: string; tone?: "primary" | "danger"; onConfirm: () => void; busy?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<Button variant={tone} full loading={busy} onClick={() => { onConfirm(); onClose(); }}>{action}</Button>}>
      {body ? <p className="text-sm text-muted">{body}</p> : null}
    </Sheet>
  );
}
