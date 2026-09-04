import { prisma } from "@/lib/prisma";

/**
 * The exactly-one-admin invariant (phase 21).
 *
 * The predicate is deliberately COUNT(role = ADMIN, ANY status) >= 1 — a
 * disabled or pending admin still counts, so this is a true single-admin cap,
 * not just "one active admin". Minting a new admin (create/invite) or promoting
 * someone to admin (role change) is refused whenever this returns true. If the
 * count ever fell to zero, creation would open again — the invariant is "at most
 * one", enforced at the write, never a stored uniqueness column.
 */
export async function adminAlreadyExists(): Promise<boolean> {
  return (await prisma.user.count({ where: { role: "ADMIN" } })) > 0;
}

/** Admins other than `exceptId` — the sole-admin self guard reads this so the
    only admin can't disable, demote or delete their own admin account and lock
    account management out. Counts any status, matching the cap above. */
export async function otherAdmins(exceptId: string): Promise<number> {
  return prisma.user.count({ where: { role: "ADMIN", id: { not: exceptId } } });
}

/** Phase 48: the exactly-one-founder invariant, same shape as the admin cap —
    ANY status counts, enforced at the write. The founder is minted only by a
    controlled promotion (script/migration), never by the UI. */
export async function founderAlreadyExists(): Promise<boolean> {
  return (await prisma.user.count({ where: { role: "FOUNDER" } })) > 0;
}

/** Phase 48: active project-authority holders (FOUNDER/DIRECTOR/HOD/MANAGER)
    other than `exceptId`. Replaces the phase-14 last-manager count: the company
    must always keep at least one active account that can run projects and
    administer the chain, whatever its level. */
export async function otherActiveAuthorities(exceptId: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: { in: ["FOUNDER", "DIRECTOR", "HOD", "MANAGER"] },
      id: { not: exceptId },
      disabledAt: null,
      status: "ACTIVE",
    },
  });
}
