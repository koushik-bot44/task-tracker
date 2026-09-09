"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { dayInputValue } from "@/lib/dates";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canAdministerAccountsRole, canSeeUserListRole, isExecutiveRole, isHodRole } from "@/lib/roles";
import { PROJECT_PRIORITY_CHOICES, PROJECT_PRIORITY_LABEL, type UserDTO } from "@/lib/types";

/** Who may lead a project: an active work account. */
function canLead(u: UserDTO): boolean {
  return u.status === "ACTIVE" && !u.disabledAt && u.role !== "ADMIN" && u.role !== "PERSON";
}

/** A "YYYY-MM-DD" from a date input, as local midnight in ISO. */
function dayToIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

type Priority = (typeof PROJECT_PRIORITY_CHOICES)[number];

/**
 * New project: Name · Priority (P1 / P2 / P3, P2 unless said otherwise) ·
 * Lead · Start · Deadline, then Save. The department comes from the screen
 * that was tapped; without one (the empty page's button) the sheet asks for
 * it after the priority. On success: "Project started", and the new project
 * opens so people can be added there.
 */
export function NewProjectSheet({
  open,
  onClose,
  departmentId = null,
  departmentName,
}: {
  open: boolean;
  onClose: () => void;
  departmentId?: string | null;
  departmentName?: string;
}) {
  const router = useRouter();
  const { show: toast } = useToast();
  const { data: me } = useMe();
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));
  const { data: departments } = useDepartments();
  const { createProject } = useProjectMutations();

  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [leadId, setLeadId] = useState("");
  const [start, setStart] = useState(() => dayInputValue(new Date()));
  const [deadline, setDeadline] = useState("");
  const [pickedDepartment, setPickedDepartment] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  /** People who are not on Orbit yet. One row per person; a person may hold
      several addresses, the first being the one the invite is sent to. */
  const [newPeople, setNewPeople] = useState<{ name: string; emails: string[] }[]>([]);
  const [morePeople, setMorePeople] = useState(false);

  // Fresh every time it opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPriority("MEDIUM");
    setLeadId("");
    setStart(dayInputValue(new Date()));
    setDeadline("");
    setPickedDepartment("");
    setMemberIds(new Set());
    setNewPeople([]);
    setMorePeople(false);
  }, [open]);

  const leads = useMemo(
    () => (users ?? []).filter(canLead).sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  // Where this person may start a project (mirrors the server rule).
  const choices = useMemo(() => {
    const executive = isExecutiveRole(me?.role);
    const hod = isHodRole(me?.role);
    return (departments ?? []).filter((d) => executive || me?.role === "MANAGER" || (hod && d.hodId === me?.id));
  }, [departments, me]);

  const targetDepartment = departmentId ?? pickedDepartment;
  const ready = name.trim().length > 0 && targetDepartment.length > 0 && !createProject.isPending;

  // People to put on it: the department's own first, everyone else under "More".
  const people = useMemo(() => {
    const all = (users ?? []).filter(canLead).filter((u) => u.id !== me?.id);
    const here = all.filter((u) => u.departmentId === targetDepartment).sort((a, b) => a.name.localeCompare(b.name));
    const elsewhere = all.filter((u) => u.departmentId !== targetDepartment).sort((a, b) => a.name.localeCompare(b.name));
    return { here, elsewhere };
  }, [users, targetDepartment, me]);
  const canInvite = canAdministerAccountsRole(me?.role);
  const addPerson = () => setNewPeople((prev) => [...prev, { name: "", emails: [""] }]);
  const editPerson = (i: number, patch: Partial<{ name: string; emails: string[] }>) =>
    setNewPeople((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  // A person counts once they have at least one address; the name is optional
  // (the server falls back to the address) but the form asks for it first.
  const invites = newPeople
    .map((p) => ({ name: p.name.trim(), emails: p.emails.map((e) => e.trim()).filter(Boolean) }))
    .filter((p) => p.emails.length > 0);

  const submit = () => {
    if (!ready) return;
    createProject.mutate(
      {
        name: name.trim(),
        departmentId: targetDepartment,
        priority,
        leadId: leadId || null,
        ...(start ? { startDate: dayToIso(start) } : {}),
        ...(deadline ? { deadline: dayToIso(deadline) } : {}),
        ...(memberIds.size ? { memberIds: [...memberIds] } : {}),
        ...(invites.length ? { invites } : {}),
      },
      {
        onSuccess: (project) => {
          onClose();
          const extra = project as typeof project & { added?: number; invited?: number };
          const bits = [extra.added ? `${extra.added} added` : null, extra.invited ? `${extra.invited} invited by email` : null].filter(Boolean);
          toast({ message: bits.length ? `Project started · ${bits.join(" · ")}` : "Project started" });
          router.push(`/project/${project.slug}`);
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New project"
      subtitle={departmentName}
      footer={
        <Button variant="primary" full onClick={submit} loading={createProject.isPending} disabled={!ready}>
          Save
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. New website"
            aria-label="Project name"
            autoFocus
            className={inputClass}
          />
        </Field>

        <div>
          <span id="new-project-priority" className="mb-1.5 block text-micro font-medium text-muted">
            Priority
          </span>
          <Segmented<Priority>
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={PROJECT_PRIORITY_CHOICES.map((value) => ({ value, label: PROJECT_PRIORITY_LABEL[value] }))}
          />
        </div>

        {!departmentId ? (
          <Field label="Department">
            <select
              value={pickedDepartment}
              onChange={(e) => setPickedDepartment(e.target.value)}
              aria-label="Department"
              className={cn(inputClass, "appearance-none")}
            >
              <option value="">Pick a department…</option>
              {choices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Lead">
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} aria-label="Lead" className={cn(inputClass, "appearance-none")}>
            <option value="">No lead yet</option>
            {leads.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>

        {canSeeUserListRole(me?.role) ? (
          <div>
            <span className="mb-1.5 block text-micro font-medium text-muted">People</span>
            <ul className="divide-y divide-line rounded-input border border-line">
              {[...people.here, ...(morePeople ? people.elsewhere : [])].map((u) => {
                const on = memberIds.has(u.id);
                return (
                  <li key={u.id}>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setMemberIds((prev) => {
                            const next = new Set(prev);
                            if (on) next.delete(u.id);
                            else next.add(u.id);
                            return next;
                          })
                        }
                        className="h-5 w-5 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{u.name}</span>
                      {u.departmentId !== targetDepartment && u.departmentName ? <span className="text-micro text-muted">{u.departmentName}</span> : null}
                    </label>
                  </li>
                );
              })}
              {people.here.length === 0 && !morePeople ? (
                <li className="px-3 py-3">
                  <p className="text-sm text-muted">Nobody is placed in this department yet.</p>
                  {canInvite ? (
                    <button type="button" onClick={addPerson} className="press mt-1.5 min-h-[32px] text-sm font-medium text-primary-ink">
                      + Add someone new
                    </button>
                  ) : null}
                </li>
              ) : null}
              {!morePeople && people.elsewhere.length ? (
                <li>
                  <button type="button" onClick={() => setMorePeople(true)} className="press flex min-h-[44px] w-full items-center px-3 text-left text-sm font-medium text-primary-ink">
                    More people…
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {canInvite ? (
          <div>
            <span className="mb-1.5 block text-micro font-medium text-muted">Someone not on Orbit yet</span>
            <div className="space-y-3">
              {newPeople.map((p, i) => {
                const who = p.name.trim() || `new person ${i + 1}`;
                return (
                  <div key={i} className="space-y-2 rounded-input bg-hover p-3">
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Field label="Name">
                          <input
                            value={p.name}
                            onChange={(e) => editPerson(i, { name: e.target.value })}
                            placeholder="Kiran"
                            aria-label={`Name of ${who}`}
                            autoFocus
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewPeople((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${who}`}
                        className="press mb-0.5 grid h-12 w-10 shrink-0 place-items-center rounded-full text-lg text-muted hover:text-danger-ink"
                      >
                        ×
                      </button>
                    </div>

                    {/* One person can hold several addresses; the first is the one written to. */}
                    <Field label={p.emails.length > 1 ? "Emails" : "Email"} hint={p.emails.length > 1 ? "The invite goes to the first one." : undefined}>
                      <div className="space-y-2">
                        {p.emails.map((email, j) => (
                          <div key={j} className="flex items-center gap-2">
                            <input
                              type="email"
                              inputMode="email"
                              autoComplete="off"
                              value={email}
                              onChange={(e) => editPerson(i, { emails: p.emails.map((x, k) => (k === j ? e.target.value : x)) })}
                              placeholder={j === 0 ? "kiran@company.com" : "their other address"}
                              aria-label={j === 0 ? `Email for ${who}` : `Another email for ${who}`}
                              className={inputClass}
                            />
                            {p.emails.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => editPerson(i, { emails: p.emails.filter((_, k) => k !== j) })}
                                aria-label={`Remove this email for ${who}`}
                                className="press grid h-12 w-10 shrink-0 place-items-center rounded-full text-lg text-muted hover:text-danger-ink"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </Field>

                    <button
                      type="button"
                      onClick={() => editPerson(i, { emails: [...p.emails, ""] })}
                      className="press min-h-[32px] text-micro font-medium text-primary-ink"
                    >
                      + Another email for this person
                    </button>
                  </div>
                );
              })}

              <button type="button" onClick={addPerson} className="press min-h-[32px] text-sm font-medium text-primary-ink">
                + Someone not on Orbit yet
              </button>
              {newPeople.length ? (
                <p className="text-micro text-muted">
                  Each gets an email to set a password and lands on this project. Someone with two addresses is one person — either one signs them in.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" className={inputClass} />
          </Field>
          <Field label="Deadline" hint="Optional">
            <input
              type="date"
              value={deadline}
              min={start || undefined}
              onChange={(e) => setDeadline(e.target.value)}
              aria-label="Deadline"
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
