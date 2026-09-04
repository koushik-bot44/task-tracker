"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { Select } from "@/components/select";
import { Tooltip } from "@/components/tooltip";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { Building2 } from "lucide-react";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import { useDepartments } from "@/lib/hooks/use-departments";
import { DepartmentManageModal } from "@/components/department-manage-modal";
import { useUsers } from "@/lib/hooks/use-users";
import {
  PROJECT_COLORS,
  PROJECT_PRIORITIES,
  PROJECT_PRIORITY_HINT,
  PROJECT_PRIORITY_LABEL,
  type ProjectPriorityValue,
} from "@/lib/types";

const fieldClass =
  "h-10 w-full rounded-input border border-line bg-bg px-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary";

/**
 * Manager-only. A tool arrives with a description (and optionally a lead, a few
 * developers, or brand-new invitees), so this is a modal rather than the old
 * inline one-liner — those answers do not fit on a sidebar row. The window is
 * resizable (drag the corner grip) for the longer forms.
 */
export function ToolCreateModal({
  open,
  departmentId: presetDepartmentId = null,
  onClose,
}: {
  open: boolean;
  /** Department-first (phase 16): the department this project is created inside.
      Pre-selected and required — there is no "unfiled" option any more. */
  departmentId?: string | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const { show: toast } = useToast();
  const { createProject } = useProjectMutations();
  const { data: users } = useUsers(open);
  const { data: departments } = useDepartments();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [developerIds, setDeveloperIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState(presetDepartmentId ?? "");
  const [newDepartmentOpen, setNewDepartmentOpen] = useState(false);
  // Phase 48: how urgent, and by when. Medium/no-deadline are honest defaults.
  const [priority, setPriority] = useState<ProjectPriorityValue>("MEDIUM");
  const [deadline, setDeadline] = useState("");
  // Phase 29/31: invite brand-new people. Each person is COMMITTED with an
  // explicit Add button (so it's clear who's in), and carries a role so a manager
  // can create a team lead here too. `draft` is the row being typed.
  type InviteRole = "RESOURCE" | "TEAM_LEAD";
  const emptyDraft = { name: "", email: "", role: "RESOURCE" as InviteRole };
  const [invitePeople, setInvitePeople] = useState<{ name: string; email: string; role: InviteRole }[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  // The window is user-resizable (drag the bottom-right grip). null = default size.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Each time the modal opens (from a given department) pre-select it.
  useEffect(() => {
    if (open) setDepartmentId(presetDepartmentId ?? "");
  }, [open, presetDepartmentId]);

  const leads = (users ?? []).filter(
    (u) => u.role === "TEAM_LEAD" && u.disabledAt === null && u.status === "ACTIVE",
  );
  // Only active developers can be members; a pending invitee has no account to
  // scope a project to yet, so they aren't offered.
  const developers = (users ?? []).filter(
    (u) => u.role === "RESOURCE" && u.disabledAt === null && u.status === "ACTIVE",
  );

  const toggleDeveloper = (id: string) =>
    setDeveloperIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );

  const draftEmailBad = draft.email.trim() !== "" && !emailRe.test(draft.email.trim());
  const draftValid = draft.name.trim() !== "" && emailRe.test(draft.email.trim());
  const draftPartial = (draft.name.trim() !== "" || draft.email.trim() !== "") && !draftValid;
  const addPerson = () => {
    if (!draftValid) return;
    setInvitePeople((p) => [...p, { name: draft.name.trim(), email: draft.email.trim(), role: draft.role }]);
    setDraft(emptyDraft);
  };
  const removePerson = (i: number) => setInvitePeople((p) => p.filter((_, idx) => idx !== i));

  // Drag-to-resize from the bottom-right grip. The dialog is centre-anchored, so
  // it grows from the middle — a corner move of dx needs the box to grow by 2·dx
  // for the grip to stay under the pointer.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = dialogRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY, startW = rect.width, startH = rect.height;
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(window.innerWidth * 0.95, Math.max(304, startW + (ev.clientX - startX) * 2));
      const h = Math.min(window.innerHeight * 0.92, Math.max(320, startH + (ev.clientY - startY) * 2));
      setSize({ w, h });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const reset = () => {
    setName("");
    setDescription("");
    setLeadId("");
    setColor(PROJECT_COLORS[0]);
    setDeveloperIds([]);
    setInvitePeople([]);
    setDraft(emptyDraft);
    setDepartmentId("");
    setPriority("MEDIUM");
    setDeadline("");
  };

  const submit = () => {
    // A department is required — every project lives in exactly one (phase 16).
    // A lead is optional (phase 31). A half-typed invite draft is intentionally
    // dropped — only people who were Added count.
    if (!name.trim() || !description.trim() || !departmentId) return;
    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        ...(leadId ? { leadId } : {}),
        color,
        developerIds,
        ...(invitePeople.length ? { inviteNew: invitePeople } : {}),
        departmentId,
        priority,
        ...(deadline ? { deadline } : {}),
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
        onError: (error) => toast({ message: (error as Error).message, tone: "danger" }),
      },
    );
  };

  const missing = [
    name.trim() ? null : "a name",
    description.trim() ? null : "a description",
    departmentId ? null : "a department",
  ].filter(Boolean) as string[];
  const ready = missing.length === 0;

  return (
    <OverlayPortal>
      <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
            onClick={onClose}
            className="fixed inset-0 z-drawer bg-black/45"
            aria-hidden
          />
          {/* Centring lives on this wrapper, not on the animated element.
              Framer writes an inline `transform` for y/scale, which silently
              beats Tailwind's -translate-y-1/2 class — the dialog was pinned
              with its TOP at 50% and never pulled back up, so at 700px tall
              the Create button sat below the fold and the modal could not be
              submitted at all. Flex centring cannot be clobbered this way. */}
          <div className="pointer-events-none fixed inset-0 z-drawer grid place-items-center p-4">
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="New project"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={size ? { width: size.w, height: size.h } : undefined}
            className="pointer-events-auto relative flex max-h-[90dvh] min-h-[20rem] w-[min(34rem,92vw)] min-w-[19rem] max-w-[95vw] flex-col overflow-hidden rounded-sheet bg-surface shadow-lift"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="flex-1 font-display text-section font-semibold text-ink">
                New project
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="press grid h-9 w-9 place-items-center rounded-card text-muted hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <Field label="Name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What is it called?"
                    aria-label="Project name"
                    className={fieldClass}
                    autoFocus
                  />
                </Field>

                <Field label="What it is for">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="One or two sentences someone new could read and understand."
                    aria-label="Description"
                    className="w-full resize-y rounded-input border border-line bg-bg p-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Priority">
                    <Select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as ProjectPriorityValue)}
                      aria-label="Priority"
                      className="w-full"
                    >
                      {PROJECT_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PROJECT_PRIORITY_LABEL[p]} — {PROJECT_PRIORITY_HINT[p]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Deadline (optional)">
                    <input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      aria-label="Deadline"
                      className={fieldClass}
                    />
                  </Field>
                </div>

                <Field label="Team lead (optional)">
                  <Select
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                    aria-label="Team lead"
                    className="w-full"
                  >
                    <option value="">No lead — assign later</option>
                    {leads.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Department">
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      aria-label="Department"
                      className="min-w-0 flex-1"
                    >
                      {/* Required (phase 16): every project lives in one department. */}
                      <option value="" disabled>
                        Select a department…
                      </option>
                      {(departments ?? []).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                    <Tooltip content="New department">
                      <button
                        type="button"
                        onClick={() => setNewDepartmentOpen(true)}
                        aria-label="New department"
                        className="press grid h-10 w-10 shrink-0 place-items-center rounded-input border border-line text-muted hover:text-ink"
                      >
                        <Building2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                    </Tooltip>
                  </div>
                </Field>

                <Field label="Team members">
                  {developers.length > 0 ? (
                    <>
                      {/* Membership scopes what a developer sees (phase 11):
                          a developer is on this tool if they're checked here
                          or assigned a task in it. Optional at creation, and
                          always editable later from the tool's Members panel. */}
                      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-input border border-line p-1">
                        {developers.map((u) => {
                          const checked = developerIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDeveloper(u.id)}
                                className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                              />
                              <span className="min-w-0 flex-1 truncate">{u.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-micro text-muted">
                        {developerIds.length === 0
                          ? "Optional — none selected."
                          : `${developerIds.length} selected.`}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      No existing team members to pick — invite someone new below.
                    </p>
                  )}

                  {/* Invite brand-new people (phase 29/31). Each is COMMITTED with
                      the Add button — so it's clear who's in — and carries a role,
                      letting a manager create a team lead here too. */}
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    <span className="block text-micro font-medium uppercase tracking-widest text-muted">
                      Invite someone new
                    </span>

                    {/* People already added */}
                    {invitePeople.length > 0 ? (
                      <ul className="space-y-1">
                        {invitePeople.map((p, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 rounded-input border border-line bg-bg px-2.5 py-1.5"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">
                              {p.name} <span className="text-muted">· {p.email}</span>
                            </span>
                            <span className="shrink-0 rounded-chip bg-hover px-2 py-0.5 text-micro font-medium text-muted">
                              {p.role === "TEAM_LEAD" ? "Team lead" : "Team member"}
                            </span>
                            <button
                              type="button"
                              onClick={() => removePerson(i)}
                              aria-label={`Remove ${p.name}`}
                              className="press grid h-7 w-7 shrink-0 place-items-center rounded-card text-muted hover:text-ink"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {/* Draft entry — fill in, pick a role, then Add. */}
                    <div className="space-y-1.5 rounded-input border border-line p-2">
                      <div className="flex items-start gap-1.5">
                        <input
                          value={draft.name}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                          placeholder="Name"
                          aria-label="Invite name"
                          className="h-9 min-w-0 flex-1 rounded-input border border-line bg-bg px-2.5 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
                        />
                        <div className="min-w-0 flex-[1.4]">
                          <input
                            type="email"
                            value={draft.email}
                            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addPerson();
                              }
                            }}
                            placeholder="email@company.com"
                            aria-label="Invite email"
                            className={cn(
                              "h-9 w-full rounded-input border bg-bg px-2.5 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary",
                              draftEmailBad ? "border-danger" : "border-line",
                            )}
                          />
                          {draftEmailBad ? (
                            <p className="mt-0.5 text-micro text-danger-ink">Enter a valid email.</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={draft.role}
                          onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as InviteRole }))}
                          aria-label="Invite role"
                          size="sm"
                          className="w-32 shrink-0"
                        >
                          <option value="RESOURCE">Team member</option>
                          <option value="TEAM_LEAD">Team lead</option>
                        </Select>
                        <span className="flex-1" aria-hidden />
                        <button
                          type="button"
                          onClick={addPerson}
                          disabled={!draftValid}
                          className="press flex h-8 shrink-0 items-center gap-1 rounded-card bg-primary px-3 text-micro font-medium text-on-primary disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                          Add
                        </button>
                      </div>
                    </div>

                    <p className="text-micro text-muted">
                      New team members join this project; a new team lead becomes this
                      project&apos;s lead (unless you picked one above). Everyone gets an
                      email to set their password.
                    </p>
                    {draftValid ? (
                      <p className="text-micro text-primary-ink">Click Add to include this person.</p>
                    ) : draftPartial ? (
                      <p className="text-micro text-muted">Enter a name and a valid email, then Add.</p>
                    ) : null}
                  </div>
                </Field>

                <Field label="Colour">
                  <div className="flex flex-wrap gap-1.5">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
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
                </Field>
              </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
                {/* A disabled submit with no explanation reads as broken. Name
                    what is still missing instead of leaving the button dim and
                    silent. */}
                {missing.length > 0 ? (
                  <p className="mr-auto text-micro text-muted">
                    Still needed: {missing.join(", ")}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="press h-9 rounded-card px-3 text-sm text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!ready || createProject.isPending}
                  className="press flex h-9 items-center gap-1.5 rounded-card bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-40"
                >
                  {createProject.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  )}
                  Create project
                </button>
              </div>

            {/* Drag this grip to resize the window (grows from the centre). */}
            <div
              onPointerDown={startResize}
              role="separator"
              aria-label="Resize dialog"
              title="Drag to resize"
              className="absolute bottom-0 right-0 z-10 grid h-4 w-4 cursor-nwse-resize touch-none place-items-center text-muted hover:text-ink"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </div>
          </motion.div>
          </div>

          {/* Inline "New department" — creating one selects it for this tool. */}
          <DepartmentManageModal
            open={newDepartmentOpen}
            onClose={() => setNewDepartmentOpen(false)}
            onCreated={(department) => setDepartmentId(department.id)}
          />
        </>
      ) : null}
      </AnimatePresence>
    </OverlayPortal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro font-medium uppercase tracking-widest text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
