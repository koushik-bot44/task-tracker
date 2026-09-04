import type { UserRole } from "@/lib/types";

/**
 * Pure role predicates, safe for BOTH client and server (no imports that pull
 * in jose or next/headers). The server's permission helpers (lib/permissions.ts)
 * build on these, and UI affordances import them directly — so a hidden button
 * and a refused request always agree on who a role is.
 *
 * Phase 48 adds the company chain above MANAGER:
 *   FOUNDER > DIRECTOR > HOD > MANAGER > TEAM_LEAD > RESOURCE
 * FOUNDER and DIRECTOR see and act on everything; an HOD sees and acts on
 * their own department. "Project authority" (isManagerRole) now means the
 * whole chain from MANAGER up, so every manager-gated project surface opens
 * to the roles above without new call sites. Two things deliberately do NOT
 * follow the chain: the Well Being feature (literal MANAGER checks, a family
 * feature not a company one) and the ADMIN accounts domain (phase 14 wall).
 */
export const isFounderRole = (r: UserRole | null | undefined): boolean => r === "FOUNDER";

/** Company-wide authority: FOUNDER and DIRECTOR see and act on everything. */
export const isExecutiveRole = (r: UserRole | null | undefined): boolean =>
  r === "FOUNDER" || r === "DIRECTOR";

export const isHodRole = (r: UserRole | null | undefined): boolean => r === "HOD";

/** PROJECT AUTHORITY — the chain that runs projects: FOUNDER, DIRECTOR, HOD,
    MANAGER. What each may reach is scoped by lib/project-visibility (executives
    all, HOD their department, manager owned ∪ collaborations). */
export const isManagerRole = (r: UserRole | null | undefined): boolean =>
  isExecutiveRole(r) || isHodRole(r) || r === "MANAGER";

export const isAdminRole = (r: UserRole | null | undefined): boolean => r === "ADMIN";

/** Task/project authority shared by the chain and leads. ADMIN is NOT here
    (phase 14 — an admin has no project or task access). */
export const isLeadOrAboveRole = (r: UserRole | null | undefined): boolean =>
  isManagerRole(r) || r === "TEAM_LEAD";

/** Who may read the people list (for assignment, collaboration, and — for an
    account admin — account management). Account WRITES are gated separately. */
export const canSeeUserListRole = (r: UserRole | null | undefined): boolean =>
  isLeadOrAboveRole(r) || isAdminRole(r);

/** Who may ADMINISTER accounts (phase 21, widened up the chain in phase 48):
    the project-authority chain and the admin. WHICH accounts each may touch is
    the rank rule in lib/permissions.ts (strictly lower rank only; the ADMIN
    account stays admin-only; FOUNDER is never mintable). */
export const canAdministerAccountsRole = (r: UserRole | null | undefined): boolean =>
  isManagerRole(r) || isAdminRole(r);

/**
 * The chain rank, for account-administration comparisons: you may create or
 * administer only accounts of STRICTLY LOWER rank. ADMIN and PERSON sit
 * outside the chain (rank 0): the ADMIN account is governed by its own
 * phase-14/21 rules, and PERSON accounts are never administered via People.
 * Note: a plain MANAGER may no longer administer a fellow MANAGER (that moved
 * up to HOD and above with the phase-48 chain) — deliberate.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  FOUNDER: 6,
  DIRECTOR: 5,
  HOD: 4,
  MANAGER: 3,
  TEAM_LEAD: 2,
  RESOURCE: 1,
  ADMIN: 0,
  PERSON: 0,
};
