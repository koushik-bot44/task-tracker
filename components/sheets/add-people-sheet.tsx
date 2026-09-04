"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Face } from "@/components/ui/face";
import { Row } from "@/components/ui/row";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { useProjectMutations, useProjectPeople } from "@/lib/hooks/use-projects";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canSeeUserListRole } from "@/lib/roles";
import type { ProjectPersonDTO, UserDTO } from "@/lib/types";

type InviteRole = "RESOURCE" | "TEAM_LEAD";

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function isWorkAccount(u: UserDTO): boolean {
  return u.status === "ACTIVE" && !u.disabledAt && u.role !== "ADMIN" && u.role !== "PERSON";
}

/**
 * Add people to a project: find someone and tap Add (people already on it
 * read "On it", and a member can be quietly removed), or invite someone new
 * by name and email at the bottom.
 */
export function AddPeopleSheet({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { show: toast } = useToast();
  const { data: me } = useMe();
  const { data: users, isLoading: loadingUsers } = useUsers(open && canSeeUserListRole(me?.role));
  const { data: people, isLoading: loadingPeople } = useProjectPeople(projectId, open);
  const { addPerson, invitePerson, removePerson } = useProjectMutations();

  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("RESOURCE");

  useEffect(() => {
    if (!open) return;
    setQ("");
    setBusyId(null);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("RESOURCE");
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

  const inviteReady = inviteName.trim().length > 0 && EMAIL_SHAPE.test(inviteEmail.trim()) && !invitePerson.isPending;
  const invite = () => {
    if (!inviteReady) return;
    const name = inviteName.trim();
    invitePerson.mutate(
      { projectId, name, email: inviteEmail.trim(), role: inviteRole },
      {
        onSuccess: (r) => {
          toast({ message: r.emailSent ? `Invite sent to ${name}` : `Added ${name}` });
          setInviteName("");
          setInviteEmail("");
          setInviteRole("RESOURCE");
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

        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Invite someone new</h3>
          <Field label="Name">
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Their name"
              aria-label="Name"
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  invite();
                }
              }}
              placeholder="name@company.com"
              aria-label="Email"
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field label="Joins as">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InviteRole)}
              aria-label="Joins as"
              className={cn(inputClass, "appearance-none")}
            >
              <option value="RESOURCE">Team member</option>
              <option value="TEAM_LEAD">Team lead</option>
            </select>
          </Field>
          <Button variant="primary" full onClick={invite} loading={invitePerson.isPending} disabled={!inviteReady}>
            Send invite
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
