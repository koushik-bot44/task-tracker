"use client";

import { useEffect, useMemo, useState } from "react";
import { InviteLinks, type InviteLink } from "@/components/people/invite-links";
import { NewPeopleRows, invitesProblem, toInvites, type NewPerson } from "@/components/people/new-people-rows";
import { rolesOfferedTo } from "@/components/people/person-sheet";
import { useToast } from "@/components/toast";
import { Face } from "@/components/ui/face";
import { Sheet } from "@/components/ui/sheet";
import { FormRow, snButton, snInput, snPrimary } from "@/components/work/sn";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useGroups } from "@/lib/hooks/use-work";
import { useProjectPeople } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canAdministerAccountsRole, canSeeUserListRole } from "@/lib/roles";
import {
  RESOLUTION_CODES,
  RESOLUTION_CODE_LABEL,
  WAITING_REASONS,
  WAITING_REASON_LABEL,
  type ResolutionCode,
  type TaskDTO,
  type WaitingReason,
} from "@/lib/types";

/*
 * Every sheet a record opens wears the record's own clothes (owner, 2026-09-16:
 * "how current task inner ui looks .. everything should look according to
 * this"): 13px text, 1px lines, 3px corners, labels down the left, and small
 * square buttons to the right instead of a full-width coloured bar. The pieces
 * come from components/work/sn.tsx, so they cannot drift from the record.
 */

/** The footer every one of these sheets uses: quiet Close, then the one action. */
function SheetButtons({
  onClose,
  action,
  onAction,
  busy = false,
  disabled = false,
  busyLabel,
  danger = false,
  closeLabel = "Close",
}: {
  onClose: () => void;
  action: string;
  onAction: () => void;
  busy?: boolean;
  disabled?: boolean;
  busyLabel?: string;
  danger?: boolean;
  closeLabel?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} className={snButton}>
        {closeLabel}
      </button>
      <button
        type="button"
        onClick={onAction}
        disabled={busy || disabled}
        className={danger ? cn(snButton, "!border-danger !text-danger-ink hover:!bg-danger-soft") : snPrimary}
      >
        {busy ? busyLabel ?? "Working…" : action}
      </button>
    </div>
  );
}

/** A plain bordered list, the way a record lists anything. */
function PickList({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div role={label ? "group" : undefined} aria-label={label} className="max-h-72 overflow-y-auto rounded-[3px] border border-line">
      {children}
    </div>
  );
}

/**
 * Who holds it: a person from the project (or the list a lead sees); a task
 * that already sits with a team offers its people. "No one" clears it. No team
 * to pick (owner, 2026-09-15).
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
    // Invited people can be given work before they sign in (2026-09-11).
    const list = (users ?? [])
      .filter((u) => u.role !== "ADMIN" && u.role !== "PERSON" && (u.status === "ACTIVE" || u.status === "PENDING") && !u.disabledAt)
      .map((u) => ({ id: u.id, name: u.status === "PENDING" ? `${u.name} (invited)` : u.name }));
    return list.length || !me ? list : [{ id: me.id, name: me.name }];
  }, [group, task.projectId, projectPeople, users, me]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Who is doing this?"
      footer={
        <div className="flex items-center justify-end">
          <button type="button" onClick={onClose} className={snButton}>
            Close
          </button>
        </div>
      }
    >
      <div className="pt-1">
        <PickList label="Who is doing this">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => {
                onAssign({ assigneeId: p.id });
                onClose();
              }}
              className={cn(
                "flex min-h-[34px] w-full items-center gap-2 border-b border-line/70 px-2 text-left text-[13px] last:border-b-0 hover:bg-hover disabled:opacity-40",
                task.assigneeId === p.id && "bg-primary-soft/50",
              )}
            >
              <Face name={p.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-ink">{p.id === me?.id ? `${p.name} (me)` : p.name}</span>
              {task.assigneeId === p.id ? <span className="shrink-0 text-[12px] text-muted">holds it</span> : null}
            </button>
          ))}
          {people.length === 0 ? (
            <p className="px-2 py-4 text-center text-[13px] text-muted">{group ? "Nobody is on this team yet." : "Nobody to pick from."}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onAssign({ assigneeId: null });
              onClose();
            }}
            className={cn(
              "flex min-h-[34px] w-full items-center gap-2 border-t border-line px-2 text-left text-[13px] hover:bg-hover disabled:opacity-40",
              task.assigneeId === null && "bg-primary-soft/50",
            )}
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-dashed border-muted" aria-hidden />
            <span className="text-muted">No one{group ? ` — leave it with ${group.name}` : ""}</span>
          </button>
        </PickList>
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
        <SheetButtons
          onClose={onClose}
          action="Mark as waiting"
          busy={busy}
          busyLabel="Marking…"
          onAction={() => {
            onWait(reason, note.trim());
            onClose();
          }}
        />
      }
    >
      <div className="-mx-4 border-y border-line">
        <div className="divide-y divide-line/70">
          <FormRow label="Waiting for" required>
            <select value={reason} onChange={(e) => setReason(e.target.value as WaitingReason)} aria-label="Waiting for" className={snInput}>
              {WAITING_REASONS.map((r) => (
                <option key={r} value={r}>
                  {WAITING_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="A word on it">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={snInput} placeholder="What exactly are we waiting on?" />
          </FormRow>
        </div>
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
        <SheetButtons
          onClose={onClose}
          action="Resolve"
          busy={busy}
          busyLabel="Resolving…"
          onAction={() => {
            onResolve({ resolutionCode: code, resolutionNotes: notes.trim(), rootCause: rootCause.trim() });
            onClose();
          }}
        />
      }
    >
      <div className="-mx-4 border-y border-line">
        <div className="divide-y divide-line/70">
          <FormRow label="Resolution" required>
            <select value={code} onChange={(e) => setCode(e.target.value as ResolutionCode)} aria-label="Resolution" className={snInput}>
              {RESOLUTION_CODES.map((c) => (
                <option key={c} value={c}>
                  {RESOLUTION_CODE_LABEL[c]}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="What was done" required>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={cn(snInput, "!h-auto py-1.5")} />
          </FormRow>
          <FormRow label="What caused it">
            <input value={rootCause} onChange={(e) => setRootCause(e.target.value)} className={snInput} />
          </FormRow>
        </div>
      </div>
    </Sheet>
  );
}

/** One question, one button. */
export function ConfirmSheet({ open, onClose, title, body, action, tone = "primary", onConfirm, busy = false }: { open: boolean; onClose: () => void; title: string; body?: string; action: string; tone?: "primary" | "danger"; onConfirm: () => void; busy?: boolean }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <SheetButtons
          onClose={onClose}
          action={action}
          busy={busy}
          danger={tone === "danger"}
          onAction={() => {
            onConfirm();
            onClose();
          }}
        />
      }
    >
      {body ? <p className="py-1 text-[13px] text-muted">{body}</p> : null}
    </Sheet>
  );
}

/**
 * Put more people on this same task.
 *
 * One record, several people, one chat between them (owner, 2026-09-15) — so
 * this ticks the people to ADD to it, not people to copy it to. Anybody already
 * on it is shown greyed and cannot be ticked twice.
 */
export function MorePeopleSheet({
  open,
  onClose,
  task,
  already,
  busy = false,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  task: TaskDTO;
  already: { id: string; name: string }[];
  busy?: boolean;
  onAdd: (assigneeIds: string[]) => void;
}) {
  const { data: me } = useMe();
  const { data: groups } = useGroups(open);
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));
  const { data: projectPeople } = useProjectPeople(task.projectId, open && Boolean(task.projectId));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  /** People who are not on Orbit yet: invited here, then put on the task like anyone else. */
  const [invites, setInvites] = useState<NewPerson[]>([]);
  const [inviting, setInviting] = useState(false);
  /** Shown after inviting: the link each new person opens. Mail may not be set up,
   *  so this is how they are reached — the sheet stays open until they are copied. */
  const [links, setLinks] = useState<InviteLink[]>([]);
  const { show: toast } = useToast();

  useEffect(() => {
    if (open) { setPicked(new Set()); setQ(""); setInvites([]); setLinks([]); }
  }, [open]);

  const newPeople = toInvites(invites);
  const inviteProblem = invitesProblem(invites);
  const total = picked.size + newPeople.length;

  const submit = async () => {
    const ids = [...picked];
    if (!newPeople.length) {
      onAdd(ids);
      onClose();
      return;
    }
    setInviting(true);
    try {
      const res = await apiPost<{ people: { id: string; name: string; email: string; url: string }[] }>("/api/users/invite", { people: newPeople });
      for (const p of res.people) ids.push(p.id);
      onAdd(ids);
      setLinks(res.people.map((p) => ({ name: p.name, email: p.email, url: p.url })));
    } catch (e) {
      toast({ message: (e as Error).message, tone: "danger" });
    } finally {
      setInviting(false);
    }
  };

  const on = new Set(already.map((p) => p.id));
  const group = (groups ?? []).find((g) => g.id === task.assignmentGroupId) ?? null;
  const people = useMemo(() => {
    const out = new Map<string, string>();
    for (const m of group?.members ?? []) out.set(m.id, m.name);
    for (const p of projectPeople ?? []) out.set(p.id, p.name);
    for (const u of users ?? []) {
      if (u.role !== "ADMIN" && u.role !== "PERSON" && (u.status === "ACTIVE" || u.status === "PENDING") && !u.disabledAt) out.set(u.id, u.status === "PENDING" ? `${u.name} (invited)` : u.name);
    }
    return [...out.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [group, projectPeople, users]);

  const shown = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add people"
      subtitle="Everybody on it shares the same task and the same chat."
      footer={
        links.length ? (
          <div className="flex items-center justify-end">
            <button type="button" onClick={onClose} className={snPrimary}>
              Done
            </button>
          </div>
        ) : (
          <SheetButtons
            onClose={onClose}
            action={total ? `Add ${total} to this task` : "Pick who to add"}
            busy={busy || inviting}
            busyLabel="Adding…"
            disabled={total === 0 || Boolean(inviteProblem)}
            onAction={() => void submit()}
          />
        )
      }
    >
      {links.length ? (
        <InviteLinks links={links} />
      ) : (
        <div className="space-y-2 pt-1">
          {people.length > 6 ? (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" className={snInput} />
          ) : null}
          {picked.size ? <p className="text-[12px] tabular-nums text-muted">{picked.size} picked</p> : null}
          <PickList label="Who to add">
            {shown.map((p) => {
              const has = on.has(p.id);
              const ticked = picked.has(p.id);
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex min-h-[32px] items-center gap-2 border-b border-line/70 px-2 text-[13px] last:border-b-0",
                    has ? "cursor-default opacity-50" : "cursor-pointer hover:bg-hover",
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={has}
                    checked={has || ticked}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (ticked) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    className="h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
                  />
                  <Face name={p.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                  {has ? <span className="shrink-0 text-[12px] text-muted">already on it</span> : null}
                </label>
              );
            })}
            {shown.length === 0 ? <p className="px-2 py-3 text-[13px] text-muted">Nobody to pick from.</p> : null}
          </PickList>
          {/* Somebody who is not on Orbit yet can still be put on the task: they are
              invited from here, exactly as on the new-task form, and are on it from
              the moment they set a password (owner, 2026-09-15). */}
          {canAdministerAccountsRole(me?.role) ? (
            <div className="space-y-1.5 border-t border-line pt-2">
              <NewPeopleRows rows={invites} onChange={setInvites} roles={rolesOfferedTo(me?.role)} addLabel={invites.length ? "+ Another person" : "+ Someone not on Orbit yet"} autoFocusLast />
              {inviteProblem ? <p className="text-[12px] text-danger-ink">{inviteProblem}</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
