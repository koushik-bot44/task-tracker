"use client";

import { Paperclip } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PendingFileChips, usePendingFiles } from "@/components/notes/pending-files";
import { InviteLinks, type InviteLink } from "@/components/people/invite-links";
import { NewPeopleRows, invitesProblem, toInvites, type NewPerson } from "@/components/people/new-people-rows";
import { rolesOfferedTo } from "@/components/people/person-sheet";
import { useToast } from "@/components/toast";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dayInputValue } from "@/lib/dates";
import { useUploadsEnabled } from "@/lib/hooks/use-comments";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useProjectMutations, useProjects } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { useRaiseWork } from "@/lib/hooks/use-work";
import { canAdministerAccountsRole, canSeeUserListRole, isExecutiveRole, isHodRole } from "@/lib/roles";
import {
  PROJECT_PRIORITY_CHOICES,
  PROJECT_PRIORITY_LABEL,
  WORK_PRIORITIES,
  WORK_PRIORITY_LABEL,
  WORK_STATE_LABEL,
  WORK_TYPE_LABEL,
  titleCase,
  workRef,
  type UserDTO,
  type WorkPriority,
  type WorkType,
} from "@/lib/types";
import { FormRow, Panel, PanelHeader, snButton, snInput, snLink, snPrimary } from "./sn";

/** What Type offers: the kinds of task, and a project. */
const TASK_KINDS: WorkType[] = ["GENERAL", "REQUEST", "APPROVAL"];
type Kind = WorkType | "PROJECT";
type ProjectPriority = (typeof PROJECT_PRIORITY_CHOICES)[number];

function dayToIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

/** The stamp a saved record shows, so a new one reads the same way. */
function stamp(d: Date): string {
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Who may lead a project: an active work account. */
function canLead(u: UserDTO): boolean {
  return u.status === "ACTIVE" && !u.disabledAt && u.role !== "ADMIN" && u.role !== "PERSON";
}

/** Who may be named on work or put on a project: a work account, invited people too. */
function canJoin(u: UserDTO): boolean {
  return (u.status === "ACTIVE" || u.status === "PENDING") && !u.disabledAt && u.role !== "ADMIN" && u.role !== "PERSON";
}

const nameOf = (u: UserDTO) => (u.status === "PENDING" ? `${u.name} (invited)` : u.name);

function toggled(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * New: the record form itself, laid out like a task (owner, 2026-09-15), so
 * nothing is typed into a sheet first. Type comes first because it decides the
 * rest: a task asks for its department, project, people and dates; Project
 * turns the same page into a new project.
 */
export function NewWorkRecord() {
  const router = useRouter();
  const params = useSearchParams();
  const presetDepartment = params.get("department") ?? "";
  const presetProject = params.get("project") ?? "";
  const { show: toast } = useToast();
  const { data: me } = useMe();
  const { data: departments } = useDepartments();
  const { data: projects } = useProjects();
  const { data: users } = useUsers(canSeeUserListRole(me?.role));
  const { data: uploads } = useUploadsEnabled();
  const raise = useRaiseWork();
  const { createProject } = useProjectMutations();

  const [kind, setKind] = useState<Kind>("GENERAL");
  const [departmentId, setDepartmentId] = useState(presetDepartment);
  const [projectId, setProjectId] = useState(presetProject);
  const [title, setTitle] = useState("");
  const [describe, setDescribe] = useState("");
  const [priority, setPriority] = useState<WorkPriority>("MEDIUM");
  const [due, setDue] = useState("");
  const [assignees, setAssignees] = useState<Set<string>>(new Set());
  const [peopleQ, setPeopleQ] = useState("");
  /** People who are not on Orbit yet; the first address of each is where the invite goes. */
  const [invites, setInvites] = useState<NewPerson[]>([]);
  const [inviting, setInviting] = useState(false);
  const files = usePendingFiles();
  const fileRef = useRef<HTMLInputElement>(null);
  /* What a half-finished Submit already saved. One task given to several people is
     one record each, saved one at a time; if the third fails, pressing Submit again
     must finish the job rather than raise the first two a second time. */
  const madeRef = useRef(new Map<string | null, Awaited<ReturnType<typeof raise.mutateAsync>>>());
  const siblingRef = useRef<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectPriority, setProjectPriority] = useState<ProjectPriority>("MEDIUM");
  const [leadId, setLeadId] = useState("");
  const [start, setStart] = useState(() => dayInputValue(new Date()));
  const [deadline, setDeadline] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  /** Saved: the invite links of the people it made, and where to go next. */
  const [done, setDone] = useState<{ links: InviteLink[]; go: string; label: string; project?: string } | null>(null);
  /* Opened and Last updated read now (owner, 2026-09-15). Filled on the browser,
     not while rendering, so the server's clock and the reader's cannot disagree. */
  const [now, setNow] = useState("");
  useEffect(() => setNow(stamp(new Date())), []);
  /* The number is drawn before anything is written (owner, 2026-09-15: "assign the
     number initially"), so the record can be named by its number while it is still
     being typed. Nobody else is handed the same one. */
  const [number, setNumber] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    apiGet<{ number: number }>("/api/tasks/next-number")
      .then((r) => {
        if (live) setNumber(r.number);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // The department of the screen that was tapped, or of its project, or the person's own — filled in once.
  const filled = useRef(Boolean(presetDepartment));
  useEffect(() => {
    if (filled.current) return;
    if (presetProject && !projects) return;
    const fromProject = presetProject ? ((projects ?? []).find((p) => p.id === presetProject)?.departmentId ?? null) : null;
    const own = fromProject ?? me?.departmentId ?? null;
    if (own) {
      filled.current = true;
      setDepartmentId(own);
    }
  }, [presetProject, projects, me?.departmentId]);

  const isProject = kind === "PROJECT";
  const canInvite = canAdministerAccountsRole(me?.role);
  const offeredRoles = rolesOfferedTo(me?.role);
  const canStartProject = isExecutiveRole(me?.role) || me?.role === "MANAGER" || isHodRole(me?.role);
  const newPeople = toInvites(invites);
  const inviteProblem = invitesProblem(invites);
  const departmentProjects = (projects ?? []).filter((p) => p.departmentId === departmentId && p.status !== "DONE");
  const projectDepartments = (departments ?? []).filter((d) => isExecutiveRole(me?.role) || me?.role === "MANAGER" || (isHodRole(me?.role) && d.hodId === me?.id));

  // A task goes to the department's people (or everyone this person can see), and to themselves.
  const candidates = useMemo(() => {
    const list = (users ?? [])
      .filter(canJoin)
      .filter((u) => !departmentId || u.departmentId === departmentId)
      .map((u) => ({ id: u.id, name: u.id === me?.id ? `${u.name} (me)` : nameOf(u) }));
    if (me && !list.some((c) => c.id === me.id)) list.unshift({ id: me.id, name: `${me.name} (me)` });
    return list;
  }, [users, departmentId, me]);
  const pickable = candidates.filter((c) => !peopleQ.trim() || c.name.toLowerCase().includes(peopleQ.trim().toLowerCase()));
  const leads = useMemo(() => (users ?? []).filter(canLead).sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const joiners = useMemo(() => (users ?? []).filter(canJoin).filter((u) => u.id !== me?.id).sort((a, b) => a.name.localeCompare(b.name)), [users, me?.id]);

  const named = assignees.size + newPeople.length;
  const noQueue = !departmentId && named === 0;
  const busy = raise.isPending || inviting || createProject.isPending;
  const ready = isProject
    ? projectName.trim().length > 0 && projectDepartments.some((d) => d.id === departmentId) && !inviteProblem
    : title.trim().length > 0 && !files.uploading && !noQueue && !inviteProblem;

  const pickFiles = (picked: FileList | null) => {
    const leftOut = files.add(picked);
    if (leftOut) toast({ message: leftOut, tone: "danger" });
  };

  const submitTask = async () => {
    if (!ready || busy) return;
    if (files.failed) {
      toast({ message: "A file didn't upload. Try it again, or take it off before submitting.", tone: "danger" });
      return;
    }
    const holders = new Set(assignees);
    const links: InviteLink[] = [];
    if (newPeople.length) {
      setInviting(true);
      try {
        const res = await apiPost<{ people: { id: string; name: string; email: string; url: string }[] }>("/api/users/invite", {
          people: newPeople.map((p) => ({ ...p, departmentId: departmentId || null })),
        });
        for (const p of res.people) {
          holders.add(p.id);
          links.push({ name: p.name, email: p.email, url: p.url });
        }
      } catch (e) {
        setInviting(false);
        toast({ message: (e as Error).message, tone: "danger" });
        return;
      }
      setInviting(false);
    }
    const base = {
      title: title.trim(),
      type: kind as WorkType,
      projectId: projectId || null,
      departmentId: departmentId || undefined,
      descriptionMd: describe.trim(),
      dueDate: due ? dayToIso(due) : null,
      priority,
    };
    // One record per person, so each can finish their own, tied together by one key.
    const list = holders.size ? [...holders] : [null];
    if (!siblingRef.current) siblingRef.current = globalThis.crypto?.randomUUID?.() ?? `sib-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const siblingKey = list.length > 1 ? siblingRef.current : undefined;
    try {
      const made: Awaited<ReturnType<typeof raise.mutateAsync>>[] = [];
      // The number drawn when the form opened belongs to one record; the others
      // raised alongside it take the next ones from the sequence themselves.
      for (const assigneeId of list) {
        const already = madeRef.current.get(assigneeId);
        if (already) {
          made.push(already);
          continue;
        }
        const row = await raise.mutateAsync({ ...base, assigneeId, ...(siblingKey ? { siblingKey } : {}), ...(made.length === 0 && number ? { number } : {}) });
        madeRef.current.set(assigneeId, row);
        made.push(row);
      }
      const attached = files.ready;
      try {
        if (attached.length) for (const t of made) await apiPost(`/api/tasks/${t.id}/attachments`, { body: "", attachments: attached });
      } catch (e) {
        toast({ message: `The task is saved, but a file couldn't be added: ${(e as Error).message}`, tone: "danger" });
      }
      const go = made.length === 1 ? `/work/${made[0].number}` : "/work?mine=requested";
      if (made.length > 1) toast({ message: `${made.length} tasks opened, one per person` });
      if (links.length) {
        setDone({ links, go, label: made.length === 1 ? "Open the task" : "Open the tasks" });
        return;
      }
      router.push(go);
    } catch (e) {
      toast({ message: (e as Error).message, tone: "danger" });
      // The people already invited keep their links, so none is lost.
      if (links.length) setDone({ links, go: "/work?mine=requested", label: "Open the tasks" });
    }
  };

  const submitProject = () => {
    if (!ready || busy) return;
    const projectInvites = newPeople.map(({ name, emails, role }) => ({ name, emails, role }));
    createProject.mutate(
      {
        name: projectName.trim(),
        departmentId,
        priority: projectPriority,
        leadId: leadId || null,
        ...(describe.trim() ? { description: describe.trim() } : {}),
        ...(start ? { startDate: dayToIso(start) } : {}),
        ...(deadline ? { deadline: dayToIso(deadline) } : {}),
        ...(memberIds.size ? { memberIds: [...memberIds] } : {}),
        ...(projectInvites.length ? { invites: projectInvites } : {}),
      },
      {
        onSuccess: (project) => {
          const extra = project as typeof project & { links?: InviteLink[] };
          toast({ message: "Project started" });
          if (extra.links?.length) {
            setDone({ links: extra.links, go: `/project/${project.slug}`, label: "Open the project", project: project.name });
            return;
          }
          router.push(`/project/${project.slug}`);
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  if (done) {
    return (
      <div className="w-full px-2 pb-8 pt-2 md:px-4">
        <Panel>
          <PanelHeader
            title={<span>{done.project ? `New project · ${done.project}` : "New record"}</span>}
            right={
              <button type="button" onClick={() => router.push(done.go)} className={snPrimary}>
                {done.label}
              </button>
            }
          />
          <div className="p-3">
            <InviteLinks links={done.links} project={done.project} />
          </div>
        </Panel>
      </div>
    );
  }

  const typeRow = (
    <FormRow label="Type">
      <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={snInput} aria-label="Type">
        {TASK_KINDS.map((t) => (
          <option key={t} value={t}>
            {WORK_TYPE_LABEL[t]}
          </option>
        ))}
        {canStartProject ? <option value="PROJECT">Project</option> : null}
      </select>
    </FormRow>
  );
  const inviteRows = canInvite ? (
    <div className="space-y-1.5">
      <NewPeopleRows rows={invites} onChange={setInvites} roles={offeredRoles} addLabel={invites.length ? "+ Another person" : "+ Someone not on Orbit yet"} autoFocusLast />
      {inviteProblem ? <p className="text-micro text-danger-ink">{inviteProblem}</p> : null}
    </div>
  ) : null;

  return (
    <div className="w-full px-2 pb-8 pt-2 md:px-4">
      <Panel>
        <PanelHeader
          title={
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              {/* Tall enough for a thumb on a phone; it looks the same on a desktop. */}
              <Link href={isProject ? "/projects" : "/work"} className={cn(snLink, "inline-flex min-h-[32px] items-center text-[13px] font-normal")}>
                {isProject ? "Projects" : "Tasks"}
              </Link>
              <span className="text-muted">›</span>
              <span>{isProject ? "New project" : "New record"}</span>
            </span>
          }
          right={
            <>
              <button type="button" onClick={() => router.back()} className={snButton}>
                Cancel
              </button>
              <button type="button" disabled={!ready || busy} onClick={() => (isProject ? submitProject() : void submitTask())} className={snPrimary}>
                {busy ? "Saving…" : "Submit"}
              </button>
            </>
          }
        />

        {isProject ? (
          <>
            <div className="grid grid-cols-1 gap-x-6 py-2 md:grid-cols-2">
              <div>
                {typeRow}
                <FormRow label="Name" required>
                  <input value={projectName} onChange={(e) => setProjectName(e.target.value)} aria-label="Project name" className={snInput} />
                </FormRow>
                <FormRow label="Department" required>
                  <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={snInput} aria-label="Department">
                    <option value="">Pick a department…</option>
                    {projectDepartments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Lead">
                  <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={snInput} aria-label="Lead">
                    <option value="">No lead yet</option>
                    {leads.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Start">
                  <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={snInput} aria-label="Start" />
                </FormRow>
                <FormRow label="Deadline">
                  <input type="date" value={deadline} min={start || undefined} onChange={(e) => setDeadline(e.target.value)} className={snInput} aria-label="Deadline" />
                </FormRow>
              </div>
              <div>
                <FormRow label="Priority">
                  <select value={projectPriority} onChange={(e) => setProjectPriority(e.target.value as ProjectPriority)} className={snInput} aria-label="Project priority">
                    {PROJECT_PRIORITY_CHOICES.map((p) => (
                      <option key={p} value={p}>
                        {PROJECT_PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </FormRow>
                {canSeeUserListRole(me?.role) ? (
                  <FormRow label="People">
                    <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-[3px] border border-line">
                      {joiners.map((u) => (
                        <li key={u.id}>
                          <label className="flex min-h-[36px] cursor-pointer items-center gap-2 px-2">
                            <input type="checkbox" checked={memberIds.has(u.id)} onChange={() => setMemberIds((prev) => toggled(prev, u.id))} className="h-4 w-4 accent-[var(--primary)]" />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{nameOf(u)}</span>
                          </label>
                        </li>
                      ))}
                      {joiners.length === 0 ? <li className="px-2 py-2 text-[13px] text-muted">Nobody to pick from.</li> : null}
                    </ul>
                  </FormRow>
                ) : null}
                {inviteRows ? <FormRow label="Not on Orbit yet">{inviteRows}</FormRow> : null}
              </div>
            </div>
            <div className="border-t border-line py-2">
              <FormRow label="Description">
                <textarea value={describe} onChange={(e) => setDescribe(e.target.value)} rows={4} aria-label="Project description" className={cn(snInput, "h-auto resize-y py-1.5")} />
              </FormRow>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-6 py-2 md:grid-cols-2">
              <div>
                {typeRow}
                <FormRow label="Number">
                  <input aria-label="Number" value={number ? workRef(kind as WorkType, number) : ""} readOnly className={snInput} />
                </FormRow>
                <FormRow label="Assigned by">
                  <input aria-label="Assigned by" value={me?.name ?? ""} readOnly className={snInput} />
                </FormRow>
                <FormRow label="Department">
                  <select
                    value={departmentId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDepartmentId(next);
                      setProjectId("");
                      /* The list below is about to show only that department's people.
                         Anyone ticked who is not on it would stay attached out of sight,
                         and the task would be saved for somebody the screen stopped
                         showing (review, 2026-09-15). */
                      setAssignees((prev) => new Set([...prev].filter((id) => !next || id === me?.id || (users ?? []).some((u) => u.id === id && u.departmentId === next))));
                      setPeopleQ("");
                    }}
                    className={snInput}
                    aria-label="Department"
                  >
                    <option value="">Pick a department…</option>
                    {(departments ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Project">
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!departmentId} className={snInput} aria-label="Project">
                    <option value="">{departmentId ? "No project" : "Pick a department first"}</option>
                    {departmentProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
              </div>
              <div>
                <FormRow label="Status">
                  <input aria-label="Status" value={WORK_STATE_LABEL.NEW} readOnly className={snInput} />
                </FormRow>
                <FormRow label="Priority">
                  <select value={priority} onChange={(e) => setPriority(e.target.value as WorkPriority)} className={snInput} aria-label="Priority">
                    {WORK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {WORK_PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Assigned to">
                  <div className="space-y-1.5">
                    <div className="rounded-[3px] border border-line">
                      {candidates.length > 6 ? (
                        <input value={peopleQ} onChange={(e) => setPeopleQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="h-8 w-full border-b border-line bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-muted" />
                      ) : null}
                      <ul className="max-h-48 divide-y divide-line overflow-y-auto">
                        {pickable.map((c) => (
                          <li key={c.id}>
                            <label className="flex min-h-[36px] cursor-pointer items-center gap-2 px-2">
                              <input type="checkbox" checked={assignees.has(c.id)} onChange={() => setAssignees((prev) => toggled(prev, c.id))} className="h-4 w-4 accent-[var(--primary)]" />
                              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{c.name}</span>
                            </label>
                          </li>
                        ))}
                        {candidates.length === 0 ? <li className="px-2 py-2 text-[13px] text-muted">Nobody to pick from.</li> : null}
                      </ul>
                    </div>
                    {named > 1 ? (
                      <p className="text-micro text-muted">Each person gets their own copy, so each can finish their own.</p>
                    ) : named === 0 ? (
                      <p className="text-micro text-muted">{departmentId ? "Nobody ticked: it waits in the department's queue for someone to pick it up." : "Pick a department or tick a person."}</p>
                    ) : null}
                    {inviteRows}
                  </div>
                </FormRow>
                <FormRow label="Due date">
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={snInput} aria-label="Due date" />
                </FormRow>
                <FormRow label="Opened">
                  <input aria-label="Opened" value={now} readOnly className={snInput} />
                </FormRow>
                <FormRow label="Last updated">
                  <input aria-label="Last updated" value={now} readOnly className={snInput} />
                </FormRow>
              </div>
            </div>
            <div className="border-t border-line py-2">
              <FormRow label="Short description" required>
                <input value={title} onChange={(e) => setTitle(titleCase(e.target.value))} aria-label="Short description" className={snInput} />
              </FormRow>
              <FormRow label="Description">
                <textarea value={describe} onChange={(e) => setDescribe(e.target.value)} rows={4} aria-label="Description" className={cn(snInput, "h-auto resize-y py-1.5")} />
              </FormRow>
              <FormRow label="Files">
                <div className="space-y-1.5">
                  <PendingFileChips items={files.items} onRemove={files.remove} onRetry={files.retry} />
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
                  <button type="button" onClick={() => fileRef.current?.click()} className={snButton}>
                    <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {files.items.length ? "Attach another file" : "Attach a file"}
                  </button>
                  {uploads?.maxBytes ? <p className="text-micro text-muted">Any document, picture or recording, up to {Math.round(uploads.maxBytes / (1024 * 1024))} MB each.</p> : null}
                </div>
              </FormRow>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
