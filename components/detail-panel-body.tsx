"use client";

import { ExternalLink, Pin, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DescriptionField } from "@/components/tree/description-field";
import { NotesThread } from "@/components/notes-thread";
import { Select } from "@/components/select";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { TaskTitle } from "@/components/task-title";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { VERIFIED_GATE_KEY, type Gate } from "@/lib/gates";
import { isLeadOrAboveRole, isManagerRole } from "@/lib/roles";
import { usePanelParams } from "@/lib/hooks/use-panel";
import { newTaskId, usePrivateTasks, useTaskMutations, useTasks } from "@/lib/hooks/use-tasks";
import { keyAtEnd } from "@/lib/order";
import { descendantIds } from "@/lib/tree";
import { GROUP_TINTS } from "@/lib/group-tints";
import {
  PRIORITIES,
  STATUS_LABEL,
  STATUSES,
  TASK_COLORS,
  type LinkItem,
  type Priority,
  type Status,
  type TaskDTO,
  type UserRole,
} from "@/lib/types";

/**
 * The editor. Rows in the tree stay lean precisely because everything that is
 * not glanceable lives here. Every field writes optimistically.
 */
export function DetailPanelBody({ task }: { task: TaskDTO }) {
  /* The manager read-only rail is deliberately NOT applied here. It guards the
     tree and the board — surfaces where a stray click or drag completes or
     moves someone else's task. Editing a field in this panel is always a
     deliberate act, so a manager is never blocked from it. */
  const { updateTask, createTask, deleteTask, restoreTask } = useTaskMutations(
    task.isPrivate
      ? { kind: "private", personalProjectId: task.personalProjectId ?? "", ownerId: task.ownerId ?? "" }
      : { kind: "project", projectId: task.projectId ?? "", gateTemplate: [] },
  );
  const { openTask, closeTask } = usePanelParams();
  const { show: toast } = useToast();
  /* Phase 20: a manager's panel is trimmed to essentials + their own Verified
     sign-off. The team's working detail — the build-gate checklist, the
     deliverable link, the links list, and tags — is hidden from a manager (they
     keep Notes as their channel). Devs and leads see everything, unchanged. */
  const { data: me } = useMe();
  const isManager = isManagerRole(me?.role);
  // Siblings/subtasks come from the same space the task lives in.
  const projectSiblings = useTasks(task.isPrivate ? null : task.projectId);
  const privateSiblings = usePrivateTasks(task.isPrivate);
  const siblings = task.isPrivate ? privateSiblings.data : projectSiblings.data;

  const addSubtask = () => {
    const id = newTaskId();
    createTask.mutate({
      id,
      parentId: task.id,
      orderKey: keyAtEnd(siblings ?? [], task.id),
    });
    openTask(id);
  };

  const removeTask = () => {
    const doomed = new Set([task.id, ...descendantIds(siblings ?? [], task.id)]);
    const removed = (siblings ?? []).filter((t) => doomed.has(t.id));
    const extra = removed.length - 1;

    deleteTask.mutate({ id: task.id, removed });
    // Deleting a subtask lands you on its parent, not on an empty screen — the
    // breadcrumb X › C › V, delete V, opens C. A root task has no parent, so
    // the panel closes as before.
    if (task.parentId) {
      openTask(task.parentId);
    } else {
      closeTask();
    }

    toast({
      message:
        extra > 0
          ? `Deleted "${task.title || "Untitled"}" and ${extra} subtask${extra === 1 ? "" : "s"}`
          : `Deleted "${task.title || "Untitled"}"`,
      action: {
        label: "Undo",
        onAction: () => restoreTask.mutate({ id: task.id, rows: removed }),
      },
    });
  };

  const patch = (data: Parameters<typeof updateTask.mutate>[0]["patch"]) => {
    updateTask.mutate({ id: task.id, patch: data });
  };

  const children = useMemo(
    () => (siblings ?? []).filter((t) => t.parentId === task.id),
    [siblings, task.id],
  );

  return (
    <div className="space-y-5 p-4">
      <fieldset className="space-y-5 border-0 p-0">
      <TitleField task={task} onCommit={(title) => patch({ title })} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select
            value={task.status}
            onChange={(e) => patch({ status: e.target.value as Status })}
            aria-label="Status"
            className="w-full"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Priority">
          <Select
            value={task.priority}
            onChange={(e) => patch({ priority: e.target.value as Priority })}
            aria-label="Priority"
            className="w-full"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Only root tasks carry an assignee (phase 11). A subtask is a step of
          the work its parent owns, so it never names its own person. A PRIVATE
          task (phase 15) is inherently its owner's, so it shows no assignee. */}
      {task.parentId === null && !task.isPrivate ? (
        <AssigneeField task={task} onChange={(assigneeId) => patch({ assigneeId })} />
      ) : null}

      <DueDateField task={task} onCommit={(dueDate) => patch({ dueDate })} />

      {isManager ? null : (
        <TagField tags={task.tags} onChange={(tags) => patch({ tags })} />
      )}

      {/* The personal row colour is a team marker too (phase 20 follow-up) —
          hidden from a manager, kept for devs/leads. */}
      {isManager ? null : (
        <ColorField color={task.color} onChange={(color) => patch({ color })} />
      )}

      <GroupColorField
        groupColor={task.groupColor}
        onChange={(groupColor) => patch({ groupColor })}
      />

      <GatesField gates={task.gates} onChange={(gates) => patch({ gates })} />

      <DescriptionField
        value={task.descriptionMd}
        onCommit={(descriptionMd) => patch({ descriptionMd })}
      />

      {isManager ? null : (
        <DeliverableField
          url={task.deliverableUrl}
          onChange={(deliverableUrl) => patch({ deliverableUrl })}
        />
      )}

      {isManager ? null : (
        <LinksField links={task.links} onChange={(links) => patch({ links })} />
      )}

      <Field label="Notes">
        <NotesThread taskId={task.id} />
      </Field>

      {/* Hover actions are gone on touch, so every one of them has a home
          here. Nothing in this app should be reachable only by hovering. */}
      <Field label="Actions">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addSubtask}
            className="press flex h-9 items-center gap-1.5 rounded-card border border-line px-3 text-sm text-ink"
          >
            <Plus className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />
            Add subtask
          </button>

          <button
            type="button"
            onClick={() =>
              patch({ pinnedAt: task.pinnedAt ? null : new Date().toISOString() })
            }
            aria-pressed={task.pinnedAt !== null}
            className={cn(
              "press flex h-9 items-center gap-1.5 rounded-card px-3 text-sm",
              task.pinnedAt ? "bg-warn-soft text-warn-ink" : "bg-hover text-ink",
            )}
          >
            <Pin
              className="h-4 w-4"
              strokeWidth={1.75}
              fill={task.pinnedAt ? "currentColor" : "none"}
              aria-hidden
            />
            {task.pinnedAt ? "Pinned to Focus" : "Pin to Focus"}
          </button>

          <button
            type="button"
            onClick={removeTask}
            className="press flex h-9 items-center gap-1.5 rounded-card bg-danger-soft px-3 text-sm text-danger-ink"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Delete
          </button>
        </div>
        <p className="text-micro text-muted">
          Deleting takes the subtasks with it. You get ten seconds to undo.
        </p>
      </Field>

      </fieldset>

      {children.length > 0 ? (
        <Field label={`Subtasks (${children.length})`}>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => openTask(child.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors duration-150 ease-out hover:bg-hover"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      child.status === "DONE" && "bg-primary",
                      child.status === "BLOCKED" && "bg-danger",
                      child.status === "IN_PROGRESS" && "bg-warn",
                      !["DONE", "BLOCKED", "IN_PROGRESS"].includes(child.status) &&
                        "bg-muted",
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      child.status === "DONE" ? "text-muted" : "text-ink",
                    )}
                  >
                    <TaskTitle title={child.title} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Field>
      ) : null}
    </div>
  );
}

const DATE_DEBOUNCE_MS = 500;

/**
 * Est. completion.
 *
 * This used to be a fully controlled input that patched the server on every
 * `input` event. A native date input reports `value === ""` until all three
 * segments are filled, so typing a date sent `dueDate: null` on each keystroke
 * — each one a write plus three query invalidations — and then the refetch
 * reset the field under the cursor. It read as "the date does not update" and
 * as the whole panel lagging. It was doing far too much, not too little.
 *
 * "Only commit a complete date" was not enough, and a write-counting probe
 * proved it: when the field already holds a date, every keystroke replaces one
 * segment and still yields a COMPLETE value, so typing 12-08-2026 fired seven
 * writes and briefly saved 2026-06-30 along the way. What is needed is a
 * debounce — the same mechanism the title field has used since phase 1.
 *
 * Now: a local draft, one write ~500ms after typing stops, flushed early on
 * blur. Picking from the calendar is still a single write.
 */
function DueDateField({
  task,
  onCommit,
}: {
  task: TaskDTO;
  onCommit: (dueDate: string | null) => void;
}) {
  const asDay = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const [draft, setDraft] = useState(asDay(task.dueDate));
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The server is the source of truth, but never yank the value out from
  // under someone mid-edit.
  useEffect(() => {
    if (!focused) setDraft(asDay(task.dueDate));
  }, [task.dueDate, focused]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = useCallback(
    (value: string) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (value === asDay(task.dueDate)) return;
      if (value === "") {
        onCommit(null);
        return;
      }
      /* Parsed as LOCAL midnight, not UTC. `new Date("2026-07-24")` is UTC
         midnight, which in any western timezone reads back as the 23rd once
         lib/dates takes a local start-of-day — an off-by-one that was latent
         here and invisible from IST. */
      const parsed = new Date(`${value}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return;
      onCommit(parsed.toISOString());
    },
    [task.dueDate, onCommit],
  );

  return (
    <Field label="Est. completion">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (timer.current) clearTimeout(timer.current);
            // One write when typing stops, not one per segment.
            timer.current = setTimeout(() => commit(next), DATE_DEBOUNCE_MS);
          }}
          onBlur={() => {
            setFocused(false);
            commit(draft);
          }}
          aria-label="Estimated completion date"
          className={cn(fieldClass, "flex-1")}
        />
        {draft ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onCommit(null);
            }}
            className="rounded-lg px-2 py-1.5 text-micro text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * Gate labels had the same defect as the date: fully controlled, rewriting the
 * whole gates array on every keystroke. Renaming "Built" cost five writes and
 * fifteen invalidations.
 */
function GateLabelInput({
  label,
  done,
  onCommit,
}: {
  label: string;
  done: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(label);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(label);
  }, [label, focused]);

  return (
    <input
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const next = draft.trim();
        if (next.length > 0 && next !== label) onCommit(next);
        else setDraft(label);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(label);
          e.currentTarget.blur();
        }
      }}
      aria-label={`Rename ${label}`}
      className={cn(
        "min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm outline-none transition-colors duration-150 ease-out focus:bg-hover",
        done ? "text-muted" : "text-ink",
      )}
    />
  );
}

const fieldClass =
  "h-9 w-full rounded-input border border-line bg-bg px-2.5 text-sm text-ink outline-none transition-colors duration-150 ease-out focus:border-primary";

/**
 * Who is doing this. Leads and managers pick anyone; a developer sees only the
 * moves they are allowed — claim it if it is spare, drop it if it is theirs —
 * because a select full of options that all 403 is worse than a short one.
 */
function AssigneeField({
  task,
  onChange,
}: {
  task: TaskDTO;
  onChange: (assigneeId: string | null) => void;
}) {
  const { data: me } = useMe();
  const { data: users } = useUsers(true);

  if (!me) return null;

  // ACTIVE only: a pending invitee can't do work yet, so they aren't assignable.
  const active = (users ?? []).filter((u) => u.disabledAt === null && u.status === "ACTIVE");
  const canAssignAnyone = isLeadOrAboveRole(me.role);
  const mayTouch =
    canAssignAnyone || task.assigneeId === null || task.assigneeId === me.id;

  if (!mayTouch) {
    return (
      <Field label="Assignee">
        <p className="flex h-9 items-center text-sm text-muted">
          {task.assigneeName ?? "Unassigned"}
          <span className="ml-2 text-micro">— a team lead can reassign this</span>
        </p>
      </Field>
    );
  }

  const options = canAssignAnyone
    ? active
    : active.filter((u) => u.id === me.id);

  // Role-grouped so a long list stays navigable, and so "who is a lead" is
  // answerable without leaving the panel.
  const groups: { label: string; role: UserRole }[] = [
    { label: "Managers", role: "MANAGER" },
    { label: "Team leads", role: "TEAM_LEAD" },
    { label: "Team members", role: "RESOURCE" },
  ];

  return (
    <Field label="Assignee">
      <Select
        value={task.assigneeId ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        aria-label="Assignee"
        className="w-full"
      >
        <option value="">Unassigned</option>
        {groups.map((g) => {
          const members = options.filter((u) => u.role === g.role);
          if (members.length === 0) return null;
          return (
            <optgroup key={g.role} label={g.label}>
              {members.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </Select>
    </Field>
  );
}

function TitleField({
  task,
  onCommit,
}: {
  task: TaskDTO;
  onCommit: (title: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setTitle(task.title);
  }, [task.title, focused]);

  return (
    <div>
      <label htmlFor="detail-title" className="sr-only">
        Title
      </label>
      <input
        id="detail-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (title !== task.title) onCommit(title);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="Untitled"
        /* truncate + size={1}: an input clips its value with no ellipsis, so a
           long title was sheared off mid-word exactly at the panel edge and
           read as broken layout rather than as more text. size={1} stops the
           default 20-character intrinsic width from setting a floor. Editing
           still scrolls normally once focused. */
        size={1}
        className="w-full min-w-0 truncate rounded-lg bg-transparent px-1 py-1 text-lg font-medium text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:bg-hover"
      />
    </div>
  );
}

function TagField({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim().toLowerCase().replace(/\s+/g, "-");
    setDraft("");
    if (value.length === 0 || tags.includes(value)) return;
    onChange([...tags, value]);
  };

  return (
    <Field label="Tags">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line p-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex h-6 items-center gap-1 rounded-chip bg-hover pl-2 pr-1 text-micro text-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              aria-label={`Remove ${tag}`}
              className="grid h-4 w-4 place-items-center rounded-full text-muted transition-colors duration-150 ease-out hover:text-danger"
            >
              <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              // Backspace on an empty field eats the last chip.
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder={tags.length === 0 ? "Add a tag" : ""}
          aria-label="Add a tag"
          className="h-6 min-w-[6rem] flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-muted"
        />
      </div>
    </Field>
  );
}

/**
 * A task's personal colour (phase 11). It is a quiet marker on the row — the
 * tool's own colour is what says which tool this is, and this never overrides
 * that. Anyone who can open this panel can set it; there is no role on a
 * decoration. "None" clears it back to no dot.
 */
function ColorField({
  color,
  onChange,
}: {
  color: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <Field label="Colour">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="No personal colour"
          aria-pressed={color === null}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full border border-line text-muted transition-transform duration-150 ease-out",
            color === null && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
          )}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
        {TASK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            className={cn(
              "h-7 w-7 rounded-full transition-transform duration-150 ease-out",
              color === c && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
      <p className="text-micro text-muted">
        A personal marker on the row — the tool’s own colour still says which
        tool this is.
      </p>
    </Field>
  );
}

/**
 * Group colour (phase 15) — a soft band drawn behind this task and its whole
 * subtree so a group's extent reads at a glance. Only shows once the task has
 * children; an inner group's colour overrides its parent's within its subtree.
 * Anyone who can edit the task may set it.
 */
function GroupColorField({
  groupColor,
  onChange,
}: {
  groupColor: string | null;
  onChange: (key: string | null) => void;
}) {
  return (
    <Field label="Group colour">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="No group colour"
          aria-pressed={groupColor === null}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md border border-line text-muted transition-transform duration-150 ease-out",
            groupColor === null && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
          )}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
        {GROUP_TINTS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-label={t.name}
            aria-pressed={groupColor === t.key}
            className={cn(
              "h-7 w-7 rounded-md border border-line transition-transform duration-150 ease-out",
              groupColor === t.key && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
            )}
            style={{ backgroundColor: t.bg }}
          />
        ))}
      </div>
      <p className="text-micro text-muted">
        A soft band behind this task and its subtasks — it appears once the task
        has children.
      </p>
    </Field>
  );
}

function GatesField({
  gates,
  onChange,
}: {
  gates: Gate[];
  onChange: (gates: Gate[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const { data: me } = useMe();

  /* Phase 11/13 split who moves what. Verified is the sign-off — a manager OR
     an admin moves it (they are peers). The build gates (built, reviewed,
     tested, deployed) belong to the team, and neither sign-off role acts on
     them. Each side SEES the other's gates — status is never secret — but the
     box is disabled where they can't act, mirroring exactly what the server
     enforces. Until the role is known nothing is toggleable. */
  const roleKnown = Boolean(me);
  const canSignOff = isManagerRole(me?.role);
  const canToggle = (key: string) => {
    if (!roleKnown) return false;
    return key === VERIFIED_GATE_KEY ? canSignOff : !canSignOff;
  };

  const toggle = (key: string) => {
    if (!canToggle(key)) return;
    onChange(
      gates.map((g) =>
        g.key === key
          ? { ...g, done: !g.done, at: !g.done ? new Date().toISOString() : null }
          : g,
      ),
    );
  };

  const rename = (key: string, label: string) =>
    onChange(gates.map((g) => (g.key === key ? { ...g, label } : g)));

  const add = () => {
    const label = draft.trim();
    setDraft("");
    if (label.length === 0) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (key.length === 0 || gates.some((g) => g.key === key)) return;
    onChange([...gates, { key, label, done: false, at: null }]);
  };

  /* Phase 20: a manager doesn't see the build-gate checklist or "Add a gate" —
     those are the team's. They see ONLY their sign-off, presented on its own.
     It's the same Verified toggle the server already permits a manager (phase
     11), just standalone. Devs and leads fall through to the full list below. */
  if (roleKnown && canSignOff) {
    const verified = gates.find((g) => g.key === VERIFIED_GATE_KEY);
    const done = verified?.done ?? false;
    const setVerified = (next: boolean) => {
      if (verified) {
        onChange(
          gates.map((g) =>
            g.key === VERIFIED_GATE_KEY
              ? { ...g, done: next, at: next ? new Date().toISOString() : null }
              : g,
          ),
        );
      } else if (next) {
        // No verified gate on this task yet — add it, signed off.
        onChange([
          ...gates,
          { key: VERIFIED_GATE_KEY, label: "Verified", done: true, at: new Date().toISOString() },
        ]);
      }
    };
    return (
      <Field label="Verified">
        <label className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2.5">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => setVerified(e.target.checked)}
            aria-label="Mark verified"
            className="h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span className="text-sm text-ink">Mark verified</span>
          {done ? (
            <span className="ml-auto text-micro font-medium text-warn-ink">Signed off</span>
          ) : null}
        </label>
        <p className="text-micro text-muted">
          Your sign-off that this is done. The team’s build gates aren’t shown here.
        </p>
      </Field>
    );
  }

  return (
    <Field label={`Gates (${gates.filter((g) => g.done).length}/${gates.length})`}>
      <ul className="space-y-1">
        {gates.map((gate) => {
          const locked = !canToggle(gate.key);
          const isVerified = gate.key === VERIFIED_GATE_KEY;
          return (
            <li key={gate.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gate.done}
                onChange={() => toggle(gate.key)}
                disabled={locked}
                aria-label={gate.label}
                title={
                  locked
                    ? isVerified
                      ? "Only a manager can move Verified"
                      : "The team moves the build gates, not managers"
                    : undefined
                }
                className={cn(
                  "h-4 w-4 shrink-0 accent-[var(--primary)]",
                  locked && "cursor-not-allowed opacity-50",
                )}
              />
              <GateLabelInput
                label={gate.label}
                done={gate.done}
                onCommit={(next) => rename(gate.key, next)}
              />
              <button
                type="button"
                onClick={() => onChange(gates.filter((g) => g.key !== gate.key))}
                aria-label={`Remove ${gate.label}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-danger-soft hover:text-danger"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      {roleKnown ? (
        <p className="mt-1.5 text-micro text-muted">
          {canSignOff
            ? "You sign off Verified; the team moves the build gates."
            : "Verified is the manager’s sign-off — the rest are yours."}
        </p>
      ) : null}

      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a gate"
          aria-label="Add a gate"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
        />
        <button
          type="button"
          onClick={add}
          aria-label="Add gate"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </Field>
  );
}

function LinksField({
  links,
  onChange,
}: {
  links: LinkItem[];
  onChange: (links: LinkItem[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const add = () => {
    const trimmedUrl = url.trim();
    if (trimmedUrl.length === 0) return;
    onChange([...links, { label: label.trim() || trimmedUrl, url: trimmedUrl }]);
    setLabel("");
    setUrl("");
  };

  return (
    <Field label="Links">
      {links.length > 0 ? (
        <ul className="mb-1.5 space-y-1">
          {links.map((link, i) => (
            <li key={`${link.url}-${i}`} className="flex items-center gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-primary-ink hover:underline"
              >
                {link.label}
              </a>
              <button
                type="button"
                onClick={() => onChange(links.filter((_, j) => j !== i))}
                aria-label={`Remove ${link.label}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-danger-soft hover:text-danger"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-1.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          aria-label="Link label"
          className="h-8 w-24 shrink-0 rounded-lg border border-line bg-bg px-2 text-sm text-ink outline-none focus:border-primary"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="https://"
          aria-label="Link URL"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-sm text-ink outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={add}
          aria-label="Add link"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </Field>
  );
}

/** One canonical URL for the thing that was produced. Links only, never files. */
function DeliverableField({
  url,
  onChange,
}: {
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const [draft, setDraft] = useState(url ?? "");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(url ?? "");
  }, [url, focused]);

  const commit = () => {
    const value = draft.trim();
    if (value.length === 0) {
      setError(null);
      if (url !== null) onChange(null);
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(value)) {
      setError("Needs to start with http:// or https://");
      return;
    }
    setError(null);
    if (value !== url) onChange(value);
  };

  return (
    <Field label="Deliverable link">
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="https://"
          aria-label="Deliverable link"
          aria-invalid={error !== null}
          className={cn(fieldClass, "flex-1", error && "border-danger")}
        />
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-primary-ink"
            aria-label="Open deliverable"
            title="Open deliverable"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </a>
        ) : null}
      </div>
      {error ? <p className="text-micro text-danger">{error}</p> : null}
    </Field>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-micro font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}
