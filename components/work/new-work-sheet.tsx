"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { apiPost } from "@/lib/api";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjects } from "@/lib/hooks/use-projects";
import { useGroups, useRaiseWork } from "@/lib/hooks/use-work";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canAdministerAccountsRole, canSeeUserListRole } from "@/lib/roles";
import type { UserDTO } from "@/lib/types";
import { WORK_PRIORITIES, WORK_PRIORITY_LABEL, WORK_TYPES, WORK_TYPE_LABEL, titleCase, type WorkPriority, type WorkType } from "@/lib/types";

/**
 * Raise a task with no project: what, what kind, which team. Everything else
 * is under "More" so the two-tap path stays (owner: the simplest screen wins).
 */
export function NewWorkSheet({ open, onClose, presetProjectId = null, presetDepartmentId = null }: { open: boolean; onClose: () => void; presetProjectId?: string | null; presetDepartmentId?: string | null }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: groups } = useGroups(open);
  const { data: departments } = useDepartments();
  const { data: projects } = useProjects();
  const raise = useRaiseWork();
  const [projectId, setProjectId] = useState("");
  const { show: toast } = useToast();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<WorkType>("GENERAL");
  const [groupId, setGroupId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [more, setMore] = useState(false);
  const [describe, setDescribe] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<WorkPriority>("MEDIUM");
  const [assignees, setAssignees] = useState<Set<string>>(new Set());
  /** People who are not on Orbit yet. One row per person; a person may hold
      several addresses, the first being the one the invite is sent to. */
  const [invites, setInvites] = useState<{ name: string; emails: string[] }[]>([]);
  const [peopleQ, setPeopleQ] = useState("");
  const [inviting, setInviting] = useState(false);
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));
  const canInvite = canAdministerAccountsRole(me?.role);

  const addInvitee = () => setInvites((prev) => [...prev, { name: "", emails: [""] }]);

  const group = (groups ?? []).find((g) => g.id === groupId) ?? null;
  // Who may be named: the team's people, else the department's, else everyone you can see.
  const candidates: { id: string; name: string }[] = group
    ? group.members
    : (users ?? [])
        .filter((u) => u.role !== "ADMIN" && u.role !== "PERSON" && !u.disabledAt)
        .filter((u) => !departmentId || u.departmentId === departmentId)
        .map((u) => ({ id: u.id, name: u.name }));

  useEffect(() => {
    if (!open) return;
    setDepartmentId(presetDepartmentId ?? me?.departmentId ?? "");
    if (presetProjectId) setProjectId(presetProjectId);
  }, [open, presetProjectId, presetDepartmentId, me?.departmentId]);

  const reset = () => {
    setTitle("");
    setType("GENERAL");
    setGroupId("");
    setDepartmentId("");
    setMore(false);
    setDescribe("");
    setDue("");
    setPriority("MEDIUM");
    setAssignees(new Set());
    setInvites([]);
    setPeopleQ("");
    setProjectId("");
  };

  const submit = async () => {
    const what = title.trim();
    if (!what) return;
    const holders = new Set(assignees);
    // People not on Orbit yet: their accounts are made now (pending); the invite
    // mail goes first and each task waits in their bell.
    const rows = invites
      .map((i) => ({ name: i.name.trim(), emails: i.emails.map((e) => e.trim()).filter(Boolean) }))
      .filter((i) => i.emails.length > 0);
    if (rows.length) {
      setInviting(true);
      try {
        for (const i of rows) {
          const [main, ...rest] = i.emails;
          const res = await apiPost<{ user: UserDTO }>("/api/users", {
            name: i.name || main.split("@")[0],
            email: main,
            ...(rest.length ? { emails: rest } : {}),
            role: "RESOURCE",
            departmentId: departmentId || group?.departmentId || null,
          });
          holders.add(res.user.id);
        }
      } catch (e) {
        setInviting(false);
        toast({ message: (e as Error).message, tone: "danger" });
        return;
      }
      setInviting(false);
    }
    const base = {
      title: what,
      type,
      projectId: projectId || null,
      assignmentGroupId: groupId || null,
      departmentId: departmentId || undefined,
      descriptionMd: describe.trim(),
      dueDate: due ? new Date(`${due}T00:00:00`).toISOString() : null,
      priority,
    };
    // One record per person, so each can complete their own; none named = one
    // unassigned record. When it goes to several, one key ties them together so
    // each record can say who else is on it.
    const list = holders.size ? [...holders] : [null];
    const siblingKey = list.length > 1 ? (globalThis.crypto?.randomUUID?.() ?? `sib-${Date.now()}-${Math.random().toString(36).slice(2)}`) : undefined;
    try {
      const made = [];
      for (const assigneeId of list) made.push(await raise.mutateAsync({ ...base, assigneeId, ...(siblingKey ? { siblingKey } : {}) }));
      reset();
      onClose();
      if (made.length === 1) router.push(`/work/${made[0].number}`);
      else {
        toast({ message: `${made.length} tasks opened, one per person` });
        router.push("/work?mine=requested");
      }
    } catch (e) {
      toast({ message: (e as Error).message, tone: "danger" });
    }
  };

  const types = WORK_TYPES.filter((t) => t === "GENERAL" || t === "REQUEST" || t === "APPROVAL");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New Task"
      footer={
        <Button variant="primary" full loading={raise.isPending || inviting} disabled={!title.trim()} onClick={() => void submit()}>
          Submit
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Short description">
          <input value={title} onChange={(e) => setTitle(titleCase(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} placeholder="What needs doing" aria-label="Short description" autoFocus className={inputClass} />
        </Field>
        <Field label="Department">
          <select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setProjectId("");
              setGroupId("");
            }}
            className={inputClass}
            aria-label="Department"
          >
            <option value="">Pick a department…</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project" hint="Tasks are raised inside a project in that department.">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!departmentId} className={inputClass} aria-label="Project">
            <option value="">{departmentId ? "No project" : "Pick a department first"}</option>
            {(projects ?? [])
              .filter((pr) => pr.departmentId === departmentId && pr.status !== "DONE")
              .map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={cn("press h-9 rounded-chip px-3 text-micro font-medium", type === t ? "bg-primary text-on-primary" : "bg-hover text-ink")}>
                {WORK_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>
        {(groups ?? []).some((g) => g.active && g.departmentId === departmentId) ? (
          <Field label="Assignment group" hint="Leave it and the rules route it.">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass} aria-label="Team">
              <option value="">Not sure yet</option>
              {(groups ?? []).filter((g) => g.active && g.departmentId === departmentId).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Assigned to" hint={group ? `People on ${group.name}. Tick more than one and each gets their own task.` : "Tick more than one and each gets their own task."}>
          <div className="rounded-input border border-line">
            {candidates.length > 6 ? (
              <input value={peopleQ} onChange={(e) => setPeopleQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="h-10 w-full border-b border-line bg-transparent px-3 text-sm text-ink outline-none placeholder:text-muted" />
            ) : null}
            <ul className="max-h-56 divide-y divide-line overflow-y-auto">
              {[...(me && !candidates.some((c) => c.id === me.id) ? [{ id: me.id, name: `${me.name} (me)` }] : []), ...candidates]
                .filter((c) => !peopleQ.trim() || c.name.toLowerCase().includes(peopleQ.trim().toLowerCase()))
                .map((c) => {
                  const on = assignees.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setAssignees((prev) => {
                              const next = new Set(prev);
                              if (on) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                          className="h-5 w-5 accent-[var(--primary)]"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.id === me?.id && !c.name.endsWith("(me)") ? `${c.name} (me)` : c.name}</span>
                      </label>
                    </li>
                  );
                })}
              {candidates.length === 0 ? (
                <li className="px-3 py-3">
                  <p className="text-sm text-muted">{me ? "Nobody else here yet." : "Nobody to pick from."}</p>
                  {canInvite ? (
                    <button type="button" onClick={addInvitee} className="press mt-1.5 min-h-[32px] text-sm font-medium text-primary-ink">
                      + Add someone new
                    </button>
                  ) : null}
                </li>
              ) : null}
            </ul>
            {assignees.size === 0 && invites.length === 0 ? <p className="border-t border-line px-3 py-2 text-micro text-muted">Nobody ticked: the task opens unassigned and the team picks it up.</p> : null}
          </div>
        </Field>
        {canInvite ? (
          <div className="space-y-3">
            {/* One card per PERSON — stacked, so it holds up on a phone — and a
                person may hold several addresses, the first being the one written to. */}
            {invites.map((inv, i) => {
              const who = inv.name.trim() || `new person ${i + 1}`;
              return (
                <div key={i} className="space-y-2 rounded-input bg-hover p-3">
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Field label="Name">
                        <input
                          value={inv.name}
                          onChange={(e) => setInvites((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                          placeholder="Kiran"
                          aria-label={`Name of ${who}`}
                          autoFocus
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInvites((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove ${who}`}
                      className="press mb-0.5 grid h-12 w-10 shrink-0 place-items-center rounded-full text-lg text-muted hover:text-danger-ink"
                    >
                      ×
                    </button>
                  </div>

                  <Field label={inv.emails.length > 1 ? "Emails" : "Email"} hint={inv.emails.length > 1 ? "The invite goes to the first one." : undefined}>
                    <div className="space-y-2">
                      {inv.emails.map((email, k) => (
                        <div key={k} className="flex items-center gap-2">
                          <input
                            type="email"
                            inputMode="email"
                            autoComplete="off"
                            value={email}
                            onChange={(e) =>
                              setInvites((prev) => prev.map((x, j) => (j === i ? { ...x, emails: x.emails.map((y, m) => (m === k ? e.target.value : y)) } : x)))
                            }
                            placeholder={k === 0 ? "kiran@company.com" : "their other address"}
                            aria-label={k === 0 ? `Email for ${who}` : `Another email for ${who}`}
                            className={inputClass}
                          />
                          {inv.emails.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => setInvites((prev) => prev.map((x, j) => (j === i ? { ...x, emails: x.emails.filter((_, m) => m !== k) } : x)))}
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
                    onClick={() => setInvites((prev) => prev.map((x, j) => (j === i ? { ...x, emails: [...x.emails, ""] } : x)))}
                    className="press min-h-[32px] text-micro font-medium text-primary-ink"
                  >
                    + Another email for this person
                  </button>
                </div>
              );
            })}
            <button type="button" onClick={addInvitee} className="press min-h-[32px] text-sm font-medium text-primary-ink">
              + Someone not on Orbit yet
            </button>
            {invites.length ? (
              <p className="text-micro text-muted">
                Each gets an email to set a password; their task waits for them. Someone with two addresses is one person — either one signs them in.
              </p>
            ) : null}
          </div>
        ) : null}

        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="press min-h-[36px] text-sm font-medium text-primary-ink">
            More…
          </button>
        ) : (
          <>
            <Field label="Description">
              <textarea value={describe} onChange={(e) => setDescribe(e.target.value)} rows={3} className={cn(inputClass, "h-auto py-2.5")} placeholder="Details, links, what done looks like." />
            </Field>
            <Field label="Due date">
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} aria-label="By when" />
            </Field>
            <Field label="Priority">
              <div className="flex flex-wrap gap-2">
                {WORK_PRIORITIES.map((p) => (
                  <button key={p} type="button" onClick={() => setPriority(p)} aria-pressed={priority === p} className={cn("press h-9 rounded-chip px-3 text-micro font-medium", priority === p ? "bg-primary text-on-primary" : "bg-hover text-ink")}>
                    {WORK_PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
        {me ? <p className="text-micro text-muted">Assigned by {me.name}.</p> : null}
      </div>
    </Sheet>
  );
}
