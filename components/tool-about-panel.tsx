"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, Loader2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { OverlayPortal } from "@/components/overlay-portal";
import { DepartmentManageModal } from "@/components/department-manage-modal";
import { RoleChip } from "@/components/role-chip";
import { Select } from "@/components/select";
import { useToast } from "@/components/toast";
import { formatDMY } from "@/lib/dates";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { useProjectMutations } from "@/lib/hooks/use-projects";
import { useDepartments } from "@/lib/hooks/use-departments";
import { isManagerRole } from "@/lib/roles";
import type { ProjectDTO, ProjectNoteDTO, UserDTO } from "@/lib/types";

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDMY(iso);
}

/**
 * "About & requirements" — what this tool is for, who owns it, and the thread
 * where its requirements get argued out.
 *
 * Same geometry as the task detail panel on purpose: a right-hand peek on
 * desktop, a bottom sheet on a phone, and one element doing both through CSS
 * rather than two components chosen by a media query.
 *
 * Readable by every role. Editing the description and the lead is a manager
 * act; posting to the thread is not, because requirements come from whoever is
 * doing the work.
 */
export function ToolAboutPanel({
  project,
  open,
  onClose,
}: {
  project: ProjectDTO;
  open: boolean;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const { data: me } = useMe();
  const { data: users } = useUsers(open);
  const { data: departments } = useDepartments();
  const { updateProject } = useProjectMutations();

  /* Phase 14: only the OWNER reshapes a tool (description, lead, department). A
     collaborating manager can still work inside it — including managing the
     developer members — but not edit its metadata. */
  const isManager = isManagerRole(me?.role);
  const isOwner = isManager && project.ownerId === me?.id;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.description);
  const [body, setBody] = useState("");
  const [newDepartmentOpen, setNewDepartmentOpen] = useState(false);

  const notesKey = ["project-notes", project.id] as const;
  const { data: notes, isLoading } = useQuery({
    queryKey: notesKey,
    queryFn: () => apiGet<ProjectNoteDTO[]>(`/api/projects/${project.id}/notes`),
    enabled: open,
  });

  const post = useMutation({
    mutationFn: (text: string) =>
      apiPost<ProjectNoteDTO>(`/api/projects/${project.id}/notes`, { body: text }),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: notesKey });
    },
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/project-notes/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: notesKey }),
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });

  const leads = (users ?? []).filter(
    (u) => u.role === "TEAM_LEAD" && u.disabledAt === null && u.status === "ACTIVE",
  );
  const developers = (users ?? []).filter(
    (u) => u.role === "RESOURCE" && u.disabledAt === null && u.status === "ACTIVE",
  );

  /* The assigned lead is always an option, even before the user list has
     loaded — and even if they have since been disabled or changed role.
     Without this the select falls back to its placeholder and the panel
     states "No lead assigned" about a tool that visibly has one, which is a
     lie told during a loading state rather than a loading state. */
  const leadOptions =
    project.leadId && !leads.some((u) => u.id === project.leadId)
      ? [
          { id: project.leadId, name: project.leadName ?? "Current lead" },
          ...leads,
        ]
      : leads;

  const saveDescription = () => {
    updateProject.mutate({ id: project.id, patch: { description: draft.trim() } });
    setEditing(false);
  };

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
            className="fixed inset-0 z-drawer bg-black/35"
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`About ${project.name}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-drawer flex max-h-[85dvh] flex-col overflow-hidden rounded-t-sheet bg-surface shadow-lift md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[28rem] md:rounded-none md:rounded-l-sheet"
          >
            <header className="flex shrink-0 items-start gap-2 border-b border-line px-4 py-3">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: project.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-section font-semibold text-ink">
                  {project.name}
                </h2>
                <p className="text-micro text-muted">About &amp; requirements</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="press grid h-9 w-9 shrink-0 place-items-center rounded-card text-muted hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              <section>
                <div className="flex items-center gap-2">
                  <h3 className="flex-1 text-micro font-medium uppercase tracking-widest text-muted">
                    What it is for
                  </h3>
                  {isOwner && !editing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(project.description);
                        setEditing(true);
                      }}
                      className="press rounded-chip bg-hover px-2 py-0.5 text-micro text-ink"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>

                {editing ? (
                  <div className="mt-1.5">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={4}
                      aria-label="Description"
                      className="w-full resize-y rounded-input border border-line bg-bg p-3 text-sm text-ink outline-none transition-colors duration-150 ease-out focus:border-primary"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="press h-8 rounded-card px-2.5 text-micro text-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveDescription}
                        className="press h-8 rounded-card bg-primary px-2.5 text-micro font-medium text-on-primary"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={cn(
                      "mt-1.5 whitespace-pre-wrap text-sm",
                      project.description ? "text-ink" : "italic text-muted",
                    )}
                  >
                    {project.description ||
                      "No description yet — this project predates the requirement."}
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-micro font-medium uppercase tracking-widest text-muted">
                  Team lead
                </h3>
                {isOwner ? (
                  <Select
                    value={project.leadId ?? ""}
                    onChange={(e) =>
                      updateProject.mutate({
                        id: project.id,
                        patch: { leadId: e.target.value === "" ? null : e.target.value },
                      })
                    }
                    aria-label="Team lead"
                    className="mt-1.5 w-full"
                  >
                    <option value="">No lead assigned</option>
                    {leadOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="mt-1.5 text-sm text-ink">
                    {project.leadName ?? (
                      <span className="italic text-muted">No lead assigned</span>
                    )}
                  </p>
                )}
              </section>

              {/* Which department this tool is filed under (phase 12). Managers
                  edit it; everyone else sees where it lives. */}
              <section>
                <h3 className="text-micro font-medium uppercase tracking-widest text-muted">
                  Department
                </h3>
                {isOwner ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Select
                      value={project.departmentId ?? ""}
                      onChange={(e) =>
                        updateProject.mutate({
                          id: project.id,
                          patch: { departmentId: e.target.value },
                        })
                      }
                      aria-label="Department"
                      className="min-w-0 flex-1"
                    >
                      {/* Required (phase 16): a project always lives in a department. */}
                      <option value="" disabled>
                        Select a department…
                      </option>
                      {(departments ?? []).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => setNewDepartmentOpen(true)}
                      aria-label="New department"
                      title="New department"
                      className="press grid h-10 w-10 shrink-0 place-items-center rounded-input border border-line text-muted hover:text-ink"
                    >
                      <Building2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-ink">
                    {(departments ?? []).find((f) => f.id === project.departmentId)?.name ?? (
                      <span className="italic text-muted">—</span>
                    )}
                  </p>
                )}
              </section>

              {/* Membership is a manager's lever and a developer's private
                  concern, so the panel only shows it to managers. */}
              {isManager ? (
                <section>
                  <h3 className="text-micro font-medium uppercase tracking-widest text-muted">
                    Team members
                  </h3>
                  <MembersManager
                    projectId={project.id}
                    projectName={project.name}
                    developers={developers}
                    enabled={open}
                  />
                </section>
              ) : null}

              {/* Collaborating managers — the OWNER invites and revokes; a
                  collaborator works in the tool but never manages this list. */}
              {isOwner ? (
                <section>
                  <h3 className="text-micro font-medium uppercase tracking-widest text-muted">
                    Collaborating managers
                  </h3>
                  <CollaboratorsManager
                    projectId={project.id}
                    managers={(users ?? []).filter(
                      (u) => u.role === "MANAGER" && u.disabledAt === null && u.status === "ACTIVE" && u.id !== me?.id,
                    )}
                    enabled={open}
                  />
                </section>
              ) : null}

              <section>
                <h3 className="text-micro font-medium uppercase tracking-widest text-muted">
                  Created
                </h3>
                <p className="mt-1.5 text-sm text-ink">
                  {formatDMY(project.createdAt)}
                </p>
              </section>

              <section>
                <h3 className="text-micro font-medium uppercase tracking-widest text-muted">
                  Requirements &amp; notes
                </h3>

                {isLoading ? (
                  <div className="mt-2 space-y-2" aria-hidden>
                    {[0, 1].map((i) => (
                      <div key={i} className="h-12 animate-pulse rounded-card bg-hover" />
                    ))}
                  </div>
                ) : (notes ?? []).length === 0 ? (
                  <p className="mt-1.5 text-sm text-muted">
                    Nothing yet. Anything the team needs to remember about this project
                    goes here.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {(notes ?? []).map((note) => (
                      <li key={note.id} className="rounded-card bg-surface-2 p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-micro font-medium text-ink">
                            {note.author.name}
                          </span>
                          <RoleChip role={note.author.role} />
                          <span className="flex-1" />
                          <span className="shrink-0 text-micro text-muted">
                            {relativeTime(note.createdAt)}
                          </span>
                          {note.author.id === me?.id ? (
                            <button
                              type="button"
                              onClick={() => remove.mutate(note.id)}
                              aria-label="Delete this note"
                              className="press grid h-6 w-6 shrink-0 place-items-center rounded-card text-muted hover:text-danger-ink"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                          {note.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex items-start gap-2">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={2}
                    placeholder="Add a note…"
                    aria-label="New note"
                    className="min-w-0 flex-1 resize-y rounded-input border border-line bg-bg p-2 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => body.trim() && post.mutate(body.trim())}
                    disabled={!body.trim() || post.isPending}
                    className="press h-9 shrink-0 rounded-card bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-40"
                  >
                    {post.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      "Post"
                    )}
                  </button>
                </div>
              </section>
            </div>
          </motion.aside>

          {/* Inline "New department" — creating one files this tool into it. */}
          <DepartmentManageModal
            open={newDepartmentOpen}
            onClose={() => setNewDepartmentOpen(false)}
            onCreated={(department) =>
              updateProject.mutate({ id: project.id, patch: { departmentId: department.id } })
            }
          />
        </>
      ) : null}
      </AnimatePresence>
    </OverlayPortal>
  );
}

type MembersResponse = {
  memberIds: string[];
  assignedCounts: Record<string, number>;
};

/**
 * The manager's roster for one tool (phase 11). Checking a developer adds them
 * as an explicit member; unchecking removes that membership. Their task
 * assignments are never touched — the safe choice — so a developer who still
 * has work here keeps seeing the tool through it until it is reassigned. The
 * panel warns about exactly that before it removes anyone who has tasks.
 */
function MembersManager({
  projectId,
  projectName,
  developers,
  enabled,
}: {
  projectId: string;
  projectName: string;
  developers: UserDTO[];
  enabled: boolean;
}) {
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const membersKey = ["project-members", projectId] as const;

  const { data } = useQuery({
    queryKey: membersKey,
    queryFn: () => apiGet<MembersResponse>(`/api/projects/${projectId}/members`),
    enabled,
  });

  const memberIds = new Set(data?.memberIds ?? []);
  const assignedCounts = data?.assignedCounts ?? {};

  const setMember = useMutation({
    mutationFn: ({ userId, member }: { userId: string; member: boolean }) =>
      member
        ? apiPost<{ ok: true }>(`/api/projects/${projectId}/members`, { userId })
        : apiDelete<{ ok: true; stillAssignedTasks: number }>(
            `/api/projects/${projectId}/members`,
            { userId },
          ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: membersKey }),
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });

  const onToggle = (u: UserDTO, nextMember: boolean) => {
    if (!nextMember) {
      const tasks = assignedCounts[u.id] ?? 0;
      if (tasks > 0) {
        const ok = window.confirm(
          `${u.name} still has ${tasks} task${tasks === 1 ? "" : "s"} assigned in ` +
            `${projectName}. Removing them from the members here keeps those ` +
            `assignments — so they keep seeing this tool through that work until ` +
            `it's reassigned. Remove them anyway?`,
        );
        if (!ok) return;
      }
    }
    setMember.mutate({ userId: u.id, member: nextMember });
  };

  if (developers.length === 0) {
    return (
      <p className="mt-1.5 text-sm text-muted">
        No team members yet. Add people from{" "}
        <span className="text-ink">People</span>, then scope them to this tool
        here.
      </p>
    );
  }

  return (
    <div className="mt-1.5 space-y-0.5 rounded-card border border-line p-1">
      {developers.map((u) => {
        const isMember = memberIds.has(u.id);
        const tasks = assignedCounts[u.id] ?? 0;
        return (
          <label
            key={u.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink transition-colors duration-150 ease-out hover:bg-hover"
          >
            <input
              type="checkbox"
              checked={isMember}
              onChange={(e) => onToggle(u, e.target.checked)}
              className="h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0 flex-1 truncate">{u.name}</span>
            {tasks > 0 ? (
              <span className="shrink-0 text-micro text-muted">
                {tasks} task{tasks === 1 ? "" : "s"}
              </span>
            ) : null}
          </label>
        );
      })}
      <p className="px-2 pb-0.5 pt-1 text-micro text-muted">
        A developer sees a tool when they’re a member here or assigned a task in
        it.
      </p>
    </div>
  );
}

type CollabRow = { userId: string; name: string; status: string };
type CollabResponse = { collaborators: CollabRow[] };

/**
 * The owner's collaborator roster for a tool (phase 14). Invite an active
 * manager (they get a pending invite + notification); revoke a pending or
 * accepted collaborator to end their access. Only the owner mounts this.
 */
function CollaboratorsManager({
  projectId,
  managers,
  enabled,
}: {
  projectId: string;
  managers: UserDTO[];
  enabled: boolean;
}) {
  const qc = useQueryClient();
  const { show: toast } = useToast();
  const key = ["project-managers", projectId] as const;
  const [pick, setPick] = useState("");

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => apiGet<CollabResponse>(`/api/projects/${projectId}/managers`),
    enabled,
  });
  const rows = data?.collaborators ?? [];
  const taken = new Set(rows.map((r) => r.userId));
  const invitable = managers.filter((m) => !taken.has(m.id));

  const invite = useMutation({
    mutationFn: (userId: string) => apiPost(`/api/projects/${projectId}/managers`, { userId }),
    onSuccess: () => {
      setPick("");
      void qc.invalidateQueries({ queryKey: key });
      toast({ message: "Invite sent." });
    },
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });
  const revoke = useMutation({
    mutationFn: (userId: string) => apiDelete(`/api/projects/${projectId}/managers/${userId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
  });

  return (
    <div className="mt-1.5 space-y-2">
      {rows.length > 0 ? (
        <ul className="space-y-0.5 rounded-card border border-line p-1">
          {rows.map((r) => (
            <li key={r.userId} className="flex items-center gap-2 px-2 py-1.5 text-sm text-ink">
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span
                className={cn(
                  "shrink-0 rounded-chip px-1.5 py-px text-micro font-medium",
                  r.status === "ACCEPTED" ? "bg-ok-soft text-ok-ink" : "bg-hover text-muted",
                )}
              >
                {r.status === "ACCEPTED" ? "Collaborating" : "Invited"}
              </span>
              <button
                type="button"
                onClick={() => revoke.mutate(r.userId)}
                aria-label={`Remove ${r.name}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-danger-soft hover:text-danger"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-micro text-muted">No collaborating managers yet.</p>
      )}

      {invitable.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <Select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label="Invite a manager"
            className="min-w-0 flex-1"
          >
            <option value="">Invite a manager…</option>
            {invitable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled={!pick || invite.isPending}
            onClick={() => pick && invite.mutate(pick)}
            className="press h-10 shrink-0 rounded-input bg-primary px-3 text-sm font-medium text-on-primary disabled:opacity-40"
          >
            Invite
          </button>
        </div>
      ) : (
        <p className="text-micro text-muted">No other managers to invite.</p>
      )}
    </div>
  );
}
