"use client";

import { useEffect, useMemo, useState } from "react";
import { InviteLinks, type InviteLink } from "@/components/people/invite-links";
import { NewPeopleRows, blankPerson, invitesProblem, toInvites, type NewPerson } from "@/components/people/new-people-rows";
import { rolesOfferedTo } from "@/components/people/person-sheet";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/toast";
import { useUserMutations } from "@/lib/hooks/use-users";
import type { DepartmentDTO, UserDTO } from "@/lib/types";

/**
 * Invite people (owner, 2026-09-11): as many as you like in one go, each with a
 * name, their addresses, a position — or none, and they join as a Team member —
 * and where they sit. Each gets a link to set their own password, shown here to
 * send on WhatsApp or copy; an email goes too when email is set up. The accounts
 * stay "Invited" until the links are used.
 *
 * The CEO, a co-founder and the admin place people anywhere, or not yet; a head
 * or a manager places them in a department they run, as the server insists
 * (assertCanPlaceInDepartment).
 */
export function InviteSheet({
  open,
  onClose,
  me,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  me: UserDTO;
  departments: DepartmentDTO[];
}) {
  const { invitePeople } = useUserMutations();
  const { show: toast } = useToast();
  const roles = rolesOfferedTo(me.role);
  const placesAnywhere = me.role === "FOUNDER" || me.role === "CO_FOUNDER" || me.role === "ADMIN";
  const placeable = useMemo(
    () => (placesAnywhere ? departments : departments.filter((d) => d.id === me.departmentId || d.hodId === me.id)),
    [placesAnywhere, departments, me.departmentId, me.id],
  );
  const startIn = placesAnywhere ? "" : placeable[0]?.id ?? "";

  const [rows, setRows] = useState<NewPerson[]>(() => [blankPerson(startIn)]);
  /** Everyone just invited, with their links. */
  const [made, setMade] = useState<{ links: InviteLink[]; emailed: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows([blankPerson(startIn)]);
    setMade(null);
  }, [open, startIn]);

  const invites = toInvites(rows);
  const problem = invitesProblem(rows, { needDepartment: !placesAnywhere && placeable.length > 0 });
  const ready = invites.length > 0 && !problem;

  const submit = () => {
    if (!ready || invitePeople.isPending) return;
    invitePeople.mutate(
      { people: invites },
      {
        onSuccess: ({ people }) => {
          const emailed = people.filter((p) => p.emailSent).length;
          setMade({ links: people.map((p) => ({ name: p.name, email: p.email, url: p.url })), emailed });
          toast({ message: people.length === 1 ? `${people[0].name} is invited — send them their link.` : `${people.length} people invited — send each their link.` });
        },
        onError: (e) => toast({ message: (e as Error).message, tone: "danger" }),
      },
    );
  };

  const again = () => {
    setRows([blankPerson(startIn)]);
    setMade(null);
  };

  if (made) {
    const all = made.links.length;
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={all === 1 ? "Invited" : `${all} people invited`}
        subtitle={made.emailed ? (made.emailed === all ? "The invites went by email too." : `${made.emailed} of the invites went by email too.`) : "Send each person their link on WhatsApp, or copy it."}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" full onClick={again}>
              Invite more people
            </Button>
            <Button variant="primary" full onClick={onClose}>
              Done
            </Button>
          </div>
        }
      >
        <InviteLinks links={made.links} className="mt-1" />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite people"
      subtitle="One or many. Give each a position, or leave them a Team member."
      footer={
        <Button variant="primary" full onClick={submit} disabled={!ready} loading={invitePeople.isPending}>
          {invites.length > 1 ? `Send ${invites.length} invites` : "Send invite"}
        </Button>
      }
    >
      <div className="space-y-3 pt-1">
        <NewPeopleRows
          rows={rows}
          onChange={setRows}
          roles={roles}
          departments={placeable}
          allowUnplaced={placesAnywhere}
          defaultDepartmentId={startIn}
          addLabel={rows.length ? "+ Another person" : "+ Someone to invite"}
          autoFocusLast
        />
        {problem ? (
          <p className="text-micro text-danger-ink" aria-live="polite">
            {problem}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
