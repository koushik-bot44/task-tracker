"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { InviteSheet } from "@/components/people/invite-sheet";
import { PersonSheet, canAdministerTarget } from "@/components/people/person-sheet";
import { ResetRequestQueue } from "@/components/people/reset-requests";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Face } from "@/components/ui/face";
import { inputClass } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/cn";
import { departmentsKey } from "@/lib/hooks/use-departments";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { ROLE_RANK, canAdministerAccountsRole, canSeeUserListRole, isAdminRole } from "@/lib/roles";
import { ROLE_LABEL, type DepartmentDTO, type UserDTO } from "@/lib/types";

type Section = { id: string; name: string; hodId: string | null; people: UserDTO[] };

/**
 * People: the company by department. Each department is a card of faces —
 * its head first — and whoever isn't placed yet sits at the bottom. This is
 * the one page where role words appear. Those allowed to run accounts get
 * "+ Invite" and can open a person to change where they sit, their role,
 * their WhatsApp number, or the account itself.
 */
export function PeoplePage() {
  const { data: me } = useMe();
  const canSee = canSeeUserListRole(me?.role);
  const canAdmin = canAdministerAccountsRole(me?.role);
  const isAdminActor = isAdminRole(me?.role);
  const { data: users, isLoading, isError, refetch } = useUsers(canSee);
  // The admin runs accounts, not work, and can't read the department list;
  // their sections come from each person's own placement instead.
  const { data: departments } = useQuery({
    queryKey: departmentsKey,
    queryFn: () => apiGet<DepartmentDTO[]>("/api/departments"),
    enabled: Boolean(me) && canSee && !isAdminActor,
  });

  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const { sections, unplaced, admins, shown } = useMemo(() => {
    const all = users ?? [];
    const depts = departments ?? [];
    const matches = (u: UserDTO) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    // Disabled accounts stay visible only to those who can enable them again.
    const listed = all.filter((u) => u.role !== "PERSON" && (u.disabledAt === null || canAdmin));
    const admins = listed.filter((u) => u.role === "ADMIN" && u.disabledAt === null);
    const people = listed.filter((u) => u.role !== "ADMIN" && matches(u));

    // A head sits at the top of the department they head, wherever they are placed.
    const heads = new Map<string, string>();
    for (const d of depts) if (d.hodId && !heads.has(d.hodId)) heads.set(d.hodId, d.id);

    const byDept = new Map<string, UserDTO[]>();
    const unplaced: UserDTO[] = [];
    for (const u of people) {
      const key = heads.get(u.id) ?? u.departmentId;
      if (!key) unplaced.push(u);
      else byDept.set(key, [...(byDept.get(key) ?? []), u]);
    }

    const order = (hodId: string | null) => (a: UserDTO, b: UserDTO) =>
      Number(b.id === hodId) - Number(a.id === hodId) || ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name);

    const sections: Section[] = depts
      .filter((d) => byDept.has(d.id))
      .map((d) => ({ id: d.id, name: d.name, hodId: d.hodId, people: [...(byDept.get(d.id) ?? [])].sort(order(d.hodId)) }));
    // A department the list doesn't know (visibility) still gets its people shown.
    for (const [id, rows] of byDept) {
      if (depts.some((d) => d.id === id)) continue;
      sections.push({ id, name: rows[0]?.departmentName ?? "Department", hodId: null, people: [...rows].sort(order(null)) });
    }
    unplaced.sort(order(null));

    return { sections, unplaced, admins, shown: people.length };
  }, [users, departments, q, canAdmin]);

  const selected = (users ?? []).find((u) => u.id === personId) ?? null;

  if (me && !canSee) {
    return (
      <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4">
        <EmptyState title="The people list isn't available for your account" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-8 pt-4">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person"
            aria-label="Find a person"
            className={cn(inputClass, "pl-10")}
          />
        </label>
        {canAdmin ? (
          <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />} onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        ) : null}
      </div>

      {isAdminActor ? <ResetRequestQueue className="mt-4" /> : null}

      {isLoading || !me ? (
        <Skeleton rows={5} className="mt-5" />
      ) : isError ? (
        <div className="mt-5">
          <ErrorState onRetry={() => void refetch()} />
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {sections.map((s) => (
            <section key={s.id} aria-label={s.name}>
              <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-muted">{s.name}</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {s.people.map((u) => (
                  <PersonRow
                    key={u.id}
                    user={u}
                    isHead={u.id === s.hodId}
                    isSelf={u.id === me.id}
                    canOpen={canAdministerTarget(me.role, u.role)}
                    onOpen={() => setPersonId(u.id)}
                  />
                ))}
              </Card>
            </section>
          ))}

          {unplaced.length > 0 ? (
            <section aria-label="Not placed yet">
              <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-muted">Not placed yet</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {unplaced.map((u) => (
                  <PersonRow
                    key={u.id}
                    user={u}
                    isHead={false}
                    isSelf={u.id === me.id}
                    canOpen={canAdministerTarget(me.role, u.role)}
                    onOpen={() => setPersonId(u.id)}
                  />
                ))}
              </Card>
            </section>
          ) : null}

          {shown === 0 ? <EmptyState title={q ? "Nobody matches that name" : "Nobody here yet"} body={q ? undefined : "Invite someone to get started."} /> : null}

          {admins.length > 0 && !q ? (
            <p className="px-1 text-micro text-muted">
              Accounts are looked after by{" "}
              {admins.map((a, i) => (
                <Fragment key={a.id}>
                  {i > 0 ? ", " : ""}
                  {isAdminActor ? (
                    <button type="button" onClick={() => setPersonId(a.id)} className="font-medium text-ink underline decoration-line underline-offset-2">
                      {a.name}
                    </button>
                  ) : (
                    a.name
                  )}
                </Fragment>
              ))}{" "}
              (admin).
            </p>
          ) : null}
        </div>
      )}

      {me && canAdmin ? (
        <>
          <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} me={me} departments={departments ?? []} />
          <PersonSheet user={selected} me={me} departments={departments ?? []} onClose={() => setPersonId(null)} />
        </>
      ) : null}
    </div>
  );
}

function PersonRow({
  user,
  isHead,
  isSelf,
  canOpen,
  onOpen,
}: {
  user: UserDTO;
  isHead: boolean;
  isSelf: boolean;
  canOpen: boolean;
  onOpen: () => void;
}) {
  const disabled = user.disabledAt !== null;
  const inner = (
    <>
      <Face name={user.name} className={disabled ? "opacity-50" : undefined} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-row", disabled ? "text-muted" : "text-ink")}>
          {user.name}
          {isSelf ? <span className="text-muted"> · you</span> : null}
        </span>
        <span className="block truncate text-micro text-muted">{isHead ? user.email : ROLE_LABEL[user.role]}</span>
      </span>
      {isHead ? <Chip tone="primary">Head of department</Chip> : null}
      {user.status === "PENDING" ? <Chip>Invited</Chip> : null}
      {disabled ? <Chip>Disabled</Chip> : null}
    </>
  );
  const cls = "flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left";
  if (canOpen) {
    return (
      <button type="button" onClick={onOpen} className={cn(cls, "press")} aria-label={`Open ${user.name}`}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
