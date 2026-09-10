"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NewPeopleRows, blankPerson, invitesProblem, toInvites, type NewPerson } from "@/components/people/new-people-rows";
import { rolesOfferedTo } from "@/components/people/person-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Face } from "@/components/ui/face";
import { Row } from "@/components/ui/row";
import { Sheet, inputClass } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { useProjectMutations, useProjectPeople } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canAdministerAccountsRole, canSeeUserListRole } from "@/lib/roles";
import type { ProjectPersonDTO, UserDTO } from "@/lib/types";

function isWorkAccount(u: UserDTO): boolean {
  return u.status === "ACTIVE" && !u.disabledAt && u.role !== "ADMIN" && u.role !== "PERSON";
}

/**
 * Add people to a project: find someone and tap Add (people already on it
 * read "On it", and a member can be quietly removed), or invite people who
 * aren't on Orbit yet at the bottom — several at once, the same rows as a new
 * project has (owner, 2026-09-10).
 */
export function AddPeopleSheet({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { show: toast } = useToast();
  const { data: me } = useMe();
  const { data: users, isLoading: loadingUsers } = useUsers(open && canSeeUserListRole(me?.role));
  const { data: people, isLoading: loadingPeople } = useProjectPeople(projectId, open);
  const { addPerson, invitePeople, removePerson } = useProjectMutations();

  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newPeople, setNewPeople] = useState<NewPerson[]>([blankPerson()]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setBusyId(null);
    setNewPeople([blankPerson()]);
  }, [open]);

  const onProject = useMemo(() => new Map((people ?? []).map((p) => [p.id, p] as const)), [people]);
  const needle = q.trim().toLowerCase();
  const candidates = useMemo(
    () =>
      (users ?? [])
        .filter(isWorkAccount)
        .filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users, needle],
  );

  const fail = (e: unknown) => toast({ message: (e as Error).message, tone: "danger" });

  const add = (u: UserDTO) => {
    setBusyId(u.id);
    addPerson.mutate(
      { projectId, userId: u.id },
      {
        onSuccess: () => toast({ message: `Added ${u.name}` }),
        onError: fail,
        onSettled: () => setBusyId(null),
      },
    );
  };

  const remove = (p: ProjectPersonDTO) => {
    if (
      p.taskCount > 0 &&
      !window.confirm(`${p.name} still holds ${p.taskCount} task${p.taskCount === 1 ? "" : "s"} here. Remove them anyway? Their tasks stay with them.`)
    ) {
      return;
    }
    setBusyId(p.id);
    removePerson.mutate(
      { projectId, userId: p.id },
      {
        onSuccess: (r) =>
          toast({
            message:
              r.stillAssignedTasks > 0
                ? `Removed ${p.name} · ${r.stillAssignedTasks} task${r.stillAssignedTasks === 1 ? "" : "s"} still theirs`
                : `Removed ${p.name}`,
          }),
        onError: fail,
        onSettled: () => setBusyId(null),
      },
    );
  };

  // Making accounts is for those who may make them; anyone else running the
  // project adds people who are here already (the server says the same).
  const canInvite = canAdministerAccountsRole(me?.role);
  const roles = rolesOfferedTo(me?.role).filter((r): r is NewPerson["role"] => r === "RESOURCE" || r === "TEAM_LEAD");
  const invites = toInvites(newPeople);
  const problem = invitesProblem(newPeople);
  const inviteReady = invites.length > 0 && !problem && !invitePeople.isPending;
  const sendInvites = () => {
    if (!inviteReady) return;
    invitePeople.mutate(
      { projectId, invites },
      {
        onSuccess: (r) => {
          const done = [r.invited ? `${r.invited} invited` : null, r.added ? `${r.added} already on Orbit, added` : null].filter(Boolean).join(" · ");
          const trouble = [
            r.emailFailed.length ? `The invite email didn't reach ${r.emailFailed.join(", ")} — resend it from People` : null,
            ...r.skipped.map((s) => `${s.email}: ${s.reason}`),
          ].filter(Boolean);
          toast({ message: [done || "Nobody new to add", ...trouble].join(". "), tone: trouble.length ? "danger" : undefined });
          setNewPeople([blankPerson()]);
        },
        onError: fail,
      },
    );
  };

  const loading = (loadingUsers || loadingPeople) && candidates.length === 0;

  return (
    <Sheet open={open} onClose={onClose} title="Add people">
      <div className="pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find someone"
            aria-label="Find someone"
            autoComplete="off"
            autoFocus
            className={cn(inputClass, "pl-10")}
          />
        </div>

        {loading ? (
          <Skeleton rows={4} className="mt-3" />
        ) : candidates.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">{needle ? "No one called that." : "No one to add yet."}</p>
        ) : (
          <ul className="-mx-4 mt-2">
            {candidates.map((u) => {
              const p = onProject.get(u.id);
              const removable = Boolean(p && p.isMember && !p.isLead && !p.isOwner);
              return (
                <li key={u.id}>
                  <Row
                    left={<Face name={u.name} />}
                    right={
                      p ? (
                        <>
                          <Chip tone="ok">On it</Chip>
                          {removable ? (
                            <button
                              type="button"
                              onClick={() => remove(p)}
                              disabled={busyId === u.id}
                              className="press h-9 rounded-input px-2 text-sm text-muted hover:text-ink disabled:opacity-40"
                            >
                              Remove
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <Button variant="secondary" onClick={() => add(u)} loading={busyId === u.id} aria-label={`Add ${u.name}`}>
                          Add
                        </Button>
                      )
                    }
                  >
                    {u.name}
                  </Row>
                </li>
              );
            })}
          </ul>
        )}

        {canInvite ? (
          <div className="mt-6 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Invite people who aren&apos;t on Orbit yet</h3>
              <p className="mt-0.5 text-micro text-muted">
                As many as you like. Each gets an email to set a password and lands on this project; anyone already on Orbit is simply added.
              </p>
            </div>
            <NewPeopleRows
              rows={newPeople}
              onChange={setNewPeople}
              roles={roles}
              addLabel={newPeople.length ? "+ Another person" : "+ Someone not on Orbit yet"}
              autoFocusLast={newPeople.length > 1}
            />
            {problem ? <p className="text-micro text-danger-ink">{problem}</p> : null}
            <Button variant="primary" full onClick={sendInvites} loading={invitePeople.isPending} disabled={!inviteReady}>
              {invites.length > 1 ? `Send ${invites.length} invites` : "Send invite"}
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
