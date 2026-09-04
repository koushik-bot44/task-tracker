"use client";

import { useMemo, useState } from "react";
import { Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { RoleChip } from "@/components/role-chip";
import { useDepartments } from "@/lib/hooks/use-departments";
import { useMe, useUsers } from "@/lib/hooks/use-users";
import { canAdministerAccountsRole, canSeeUserListRole } from "@/lib/roles";
import { cn } from "@/lib/cn";
import type { UserDTO, UserRole } from "@/lib/types";

/**
 * The org chart (phase 48) — the company as a readable, indented tree:
 * Founder → Directors → Heads of department (with their department) →
 * Managers → Team leads → Team members. No boxes-and-lines diagram: an
 * indented list survives a phone screen, a screen reader, and a long list of
 * names. Rows are read-only here; account management stays on the accounts
 * board (Settings → People) for those allowed in.
 */
/* DIRECTOR is the top tier (the owner folded FOUNDER away; the dormant enum
   value would render at the top if a row ever carried it). Indents are
   assigned over the tiers that actually have people, so the top tier always
   starts at the left edge. */
const TIER_ORDER: UserRole[] = ["FOUNDER", "DIRECTOR", "HOD", "MANAGER", "TEAM_LEAD", "RESOURCE"];

export function OrgChart() {
  const { data: me } = useMe();
  const { data: users, isLoading } = useUsers(canSeeUserListRole(me?.role));
  const { data: departments } = useDepartments();
  const [query, setQuery] = useState("");

  const headedBy = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const d of departments ?? []) {
      if (!d.hodId) continue;
      map.set(d.hodId, [...(map.get(d.hodId) ?? []), d.name]);
    }
    return map;
  }, [departments]);

  const q = query.trim().toLowerCase();
  const matches = (u: UserDTO) =>
    !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);

  if (me && !canSeeUserListRole(me.role)) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted">
        The people list isn&apos;t available for your account.
      </div>
    );
  }

  const active = (users ?? []).filter((u) => !u.disabledAt);
  const admin = active.filter((u) => u.role === "ADMIN");

  return (
    <div className="max-w-3xl px-4 py-4 sm:px-8 sm:py-6">
      <p className="text-sm text-muted">
        Everyone in the company, from the founder down. Click a department head
        to open their department.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person"
            aria-label="Find a person"
            className="h-9 w-full rounded-input border border-line bg-surface pl-8 pr-3 text-sm text-ink outline-none transition-colors duration-150 ease-out placeholder:text-muted focus:border-primary"
          />
        </div>
        {canAdministerAccountsRole(me?.role) ? (
          <Link
            href="/settings/users"
            className="press flex h-9 items-center gap-1.5 rounded-input border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-hover"
          >
            <Settings2 className="h-4 w-4 text-muted" strokeWidth={2} aria-hidden />
            Manage accounts
          </Link>
        ) : null}
      </div>

      <div className="card mt-4 p-2">
        {isLoading ? (
          <div className="space-y-1 p-2" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-hover" />
            ))}
          </div>
        ) : (
          <ul>
            {(() => {
              const tiers = TIER_ORDER.map((role) =>
                active.filter((u) => u.role === role && matches(u)),
              ).filter((tier) => tier.length > 0);
              return tiers.flatMap((tier, indent) =>
                tier.map((u) => (
                  <PersonRow
                    key={u.id}
                    user={u}
                    indent={q ? 0 : indent}
                    heads={headedBy.get(u.id) ?? []}
                    departments={departments ?? []}
                  />
                )),
              );
            })()}
          </ul>
        )}
        {!isLoading && active.filter(matches).length === 0 ? (
          <p className="p-4 text-center text-sm text-muted">Nobody matches that name.</p>
        ) : null}
      </div>

      {admin.length > 0 && !q ? (
        <p className="mt-3 px-1 text-micro text-muted">
          Accounts are looked after by {admin.map((a) => a.name).join(", ")} (admin).
        </p>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function PersonRow({
  user,
  indent,
  heads,
  departments,
}: {
  user: UserDTO;
  indent: number;
  heads: string[];
  departments: { id: string; name: string }[];
}) {
  const headedIds = departments.filter((d) => heads.includes(d.name)).map((d) => d.id);
  const secondLine =
    user.role === "HOD"
      ? heads.length > 0
        ? `Heads ${heads.join(", ")}`
        : "No department assigned yet"
      : null;

  const row = (
    <div
      className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors duration-150 ease-out hover:bg-hover"
      style={{ paddingLeft: `${8 + indent * 20}px` }}
    >
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-chip bg-primary-soft text-micro font-semibold text-primary-ink"
      >
        {initials(user.name)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{user.name}</span>
          <RoleChip role={user.role} />
          {user.status === "PENDING" ? (
            <span className={cn("rounded-chip bg-hover px-1.5 py-px text-micro text-muted")}>Invited</span>
          ) : null}
        </span>
        {secondLine ? <span className="block truncate text-micro text-muted">{secondLine}</span> : null}
      </span>
    </div>
  );

  return (
    <li>
      {user.role === "HOD" && headedIds.length > 0 ? (
        <Link href={`/department/${headedIds[0]}`} className="block">
          {row}
        </Link>
      ) : (
        row
      )}
    </li>
  );
}
