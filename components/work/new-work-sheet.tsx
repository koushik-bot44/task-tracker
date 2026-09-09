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
  const [assigneeId, setAssigneeId] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const { data: users } = useUsers(open && canSeeUserListRole(me?.role));
  const canInvite = canAdministerAccountsRole(me?.role);

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
    if (presetProjectId) setProjectId(presetProjectId);
    if (presetDepartmentId) setDepartmentId(presetDepartmentId);
  }, [open, presetProjectId, presetDepartmentId]);

  const reset = () => {
    setTitle("");
    setType("GENERAL");
    setGroupId("");
    setDepartmentId("");
    setMore(false);
    setDescribe("");
    setDue("");
    setPriority("MEDIUM");
    setAssigneeId("");
    setProjectId("");
    setInviteOpen(false);
    setInviteName("");
    setInviteEmail("");
  };

  const submit = async () => {
    const what = title.trim();
    if (!what) return;
    let holder = assigneeId || null;
    // Someone not on Orbit yet: their account is made now (pending), and the task waits in their bell.
    if (inviteOpen && inviteEmail.trim()) {
      setInviting(true);
      try {
        const res = await apiPost<{ user: UserDTO }>("/api/users", {
          name: inviteName.trim() || inviteEmail.trim().split("@")[0],
          email: inviteEmail.trim(),
          role: "RESOURCE",
          departmentId: departmentId || group?.departmentId || null,
        });
        holder = res.user.id;
      } catch (e) {
        setInviting(false);
        toast({ message: (e as Error).message, tone: "danger" });
        return;
      }
      setInviting(false);
    }
    raise.mutate(
      {
        title: what,
        type,
        projectId: projectId || null,
        assignmentGroupId: groupId || null,
        departmentId: departmentId || undefined,
        assigneeId: holder,
        descriptionMd: describe.trim(),
        dueDate: due ? new Date(`${due}T00:00:00`).toISOString() : null,
        priority,
      },
      {
        onSuccess: (t) => {
          reset();
          onClose();
          router.push(`/work/${t.number}`);
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
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
        {(projects ?? []).length ? (
          <Field label="Project" hint="Tasks are raised inside a project; its department comes with it.">
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); const pr = (projects ?? []).find((x) => x.id === e.target.value); if (pr?.departmentId) setDepartmentId(pr.departmentId); }} className={inputClass} aria-label="Project">
              <option value="">No project</option>
              {(departments ?? []).map((d) => {
                const inDept = (projects ?? []).filter((pr) => pr.departmentId === d.id && pr.status !== "DONE");
                return inDept.length ? (
                  <optgroup key={d.id} label={d.name}>
                    {inDept.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </Field>
        ) : null}
        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={cn("press h-9 rounded-chip px-3 text-micro font-medium", type === t ? "bg-primary text-on-primary" : "bg-hover text-ink")}>
                {WORK_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>
        {(groups ?? []).length ? (
          <Field label="Assignment group" hint="Leave it and the rules route it.">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass} aria-label="Team">
              <option value="">Not sure yet</option>
              {(groups ?? []).filter((g) => g.active).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.departmentName} · {g.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (departments ?? []).length && !projectId ? (
          <Field label="Department">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass} aria-label="Department">
              <option value="">My own</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {candidates.length || canInvite ? (
          <Field label="Assigned to" hint={group ? `People on ${group.name}` : undefined}>
            <select value={inviteOpen ? "__invite" : assigneeId} onChange={(e) => { if (e.target.value === "__invite") { setInviteOpen(true); setAssigneeId(""); } else { setInviteOpen(false); setAssigneeId(e.target.value); } }} className={inputClass} aria-label="Who should do it">
              <option value="">Unassigned</option>
              {me && !candidates.some((c) => c.id === me.id) ? <option value={me.id}>{me.name} (me)</option> : null}
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id === me?.id ? `${c.name} (me)` : c.name}
                </option>
              ))}
              {canInvite ? <option value="__invite">Someone not on Orbit yet…</option> : null}
            </select>
          </Field>
        ) : null}
        {inviteOpen ? (
          <div className="grid grid-cols-2 gap-3 rounded-input bg-hover p-3">
            <Field label="Their name">
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Kiran" aria-label="Their name" className={inputClass} />
            </Field>
            <Field label="Their email" hint="They get an email to set a password; the task waits for them.">
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="kiran@company.com" aria-label="Their email" className={inputClass} />
            </Field>
          </div>
        ) : null}

        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="press text-sm font-medium text-primary-ink">
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
        {me ? <p className="text-micro text-muted">Requested by {me.name}.</p> : null}
      </div>
    </Sheet>
  );
}
