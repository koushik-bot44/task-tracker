/**
 * The permission matrix, in one file.
 *
 * The UI hides things; this decides them. Every rule here is enforced on the
 * server inside a route handler, and the client is free to be wrong — hiding a
 * button is a courtesy, not a control.
 *
 * Roles (phase 14 walls + the phase 48 chain):
 *
 *   FOUNDER    the top of the chain. Sees and acts on everything, administers
 *              every account below it. Exactly one; never mintable in the UI.
 *   DIRECTOR   company-wide like FOUNDER, but cannot touch the FOUNDER account
 *              or delete departments (founder-only powers).
 *   HOD        head of a department: full authority over the projects filed in
 *              the department(s) they head, nothing beyond it.
 *   MANAGER    runs projects, SILOED to the ones they own or collaborate on.
 *              The OWNER of a project may delete it, edit its metadata, re-file
 *              it into a department, and manage its collaborator managers; a
 *              COLLABORATOR works inside it (tasks, gates, members, events,
 *              notes) but cannot delete it or manage ownership/collaborators.
 *   ADMIN      runs ACCOUNTS only — creates and manages every account and
 *              actions password-reset requests. Sees NO project, task, department,
 *              dashboard, calendar or review.
 *   TEAM_LEAD  owns delivery inside tools. Creates and edits tasks, assigns
 *              anyone, sets any status. Not siloed. Cannot sign off review.
 *   RESOURCE   (was DEVELOPER; shown as "Team member") does the work; may only
 *              move the assignee on tasks that are unassigned or already their own.
 */
import type { Role, User } from "@prisma/client";
import { HttpError } from "@/lib/session";
import {
  ROLE_RANK,
  canAdministerAccountsRole,
  canSeeUserListRole,
  isAdminRole,
  isLeadOrAboveRole,
  isManagerRole,
} from "@/lib/roles";

export const CAN_LEAD: Role[] = ["FOUNDER", "DIRECTOR", "HOD", "MANAGER", "TEAM_LEAD"];

export function isManager(user: { role: Role }): boolean {
  return isManagerRole(user.role);
}

export function isAdmin(user: { role: Role }): boolean {
  return isAdminRole(user.role);
}

/** Managers and leads share every task-level power except Verified. Admin is
    NOT here (phase 14 — no project access). */
export function isLeadOrAbove(user: { role: Role }): boolean {
  return isLeadOrAboveRole(user.role);
}

export function assertManager(user: { role: Role }, what = "Managers only") {
  if (!isManager(user)) throw new HttpError(403, what);
}

export function assertAdmin(user: { role: Role }, what = "Admins only") {
  if (!isAdmin(user)) throw new HttpError(403, what);
}

/**
 * Who may set `assigneeId` to a given value on a given task.
 *
 * Leads and managers assign anybody. A developer may only claim an unassigned
 * task or let go of one that is already theirs.
 */
export function assertCanSetAssignee(
  actor: User,
  task: { assigneeId: string | null },
  nextAssigneeId: string | null,
) {
  if (isLeadOrAbove(actor)) return;

  const current = task.assigneeId;
  const ownsIt = current === actor.id;
  const unassigned = current === null;
  if (!ownsIt && !unassigned) {
    throw new HttpError(403, "Only a team lead can reassign someone else's task");
  }
  if (nextAssigneeId !== null && nextAssigneeId !== actor.id) {
    throw new HttpError(403, "Only a team lead can assign work to someone else");
  }
}

/**
 * Who may READ the people list. Managers and leads need it to assign work and
 * invite collaborators; admins run accounts. Creating and changing accounts is
 * admin-only (phase 14) and enforced separately.
 */
export function assertCanListUsers(user: { role: Role }) {
  if (!canSeeUserListRole(user.role)) throw new HttpError(403, "Not allowed");
}

/**
 * Who may create/invite an account, and with which role (phase 21; phase 48
 * adds the rank rule).
 *
 * Chain actors (FOUNDER/DIRECTOR/HOD/MANAGER) may create only accounts of
 * STRICTLY LOWER rank — a founder can mint directors, a director can mint
 * HODs, an HOD can mint managers, a manager can mint leads and team members.
 * The ADMIN actor keeps its phase-21 scope: manager-and-below. The ADMIN role
 * is special: only an admin could mint one, and admins are capped at exactly
 * one — the caller ALSO checks `adminAlreadyExists()` and 409s when a second
 * admin is attempted (see lib/account-guards.ts). FOUNDER is capped the same
 * way and is never mintable through the UI at all.
 */
export function assertCanCreateUserWithRole(actor: { role: Role }, newRole: Role) {
  if (!canAdministerAccountsRole(actor.role)) {
    throw new HttpError(403, "You don't have permission to create accounts");
  }
  if (newRole === "FOUNDER") {
    throw new HttpError(403, "A founder account can't be created from here.");
  }
  if (newRole === "ADMIN" && !isAdmin(actor)) {
    throw new HttpError(403, "Only an admin can create an admin account.");
  }
  // Phase 35: a PERSON is never created through People — it is created only by the
  // Routine flow (which sets up the Person link + login together).
  if (newRole === "PERSON") {
    throw new HttpError(403, "A person account is created from the Well Being tab.");
  }
  // Phase 48 rank rule for the chain roles. The admin actor keeps its phase-21
  // scope (manager-and-below); chain actors create strictly below themselves —
  // EXCEPT directors, who are the top of the chain (the owner folded FOUNDER
  // away) and so may mint fellow directors, or nobody could.
  if (newRole === "DIRECTOR" || newRole === "HOD" || newRole === "MANAGER" || newRole === "TEAM_LEAD" || newRole === "RESOURCE") {
    const ceiling = isAdmin(actor)
      ? ROLE_RANK.MANAGER
      : actor.role === "DIRECTOR" || actor.role === "FOUNDER"
        ? ROLE_RANK.DIRECTOR
        : ROLE_RANK[actor.role] - 1;
    if (ROLE_RANK[newRole] > ceiling) {
      throw new HttpError(403, "You can only create accounts below your own level.");
    }
  }
}

/**
 * Who may disable/enable, reset, re-role or delete a GIVEN account (phase 21;
 * phase 48 adds the rank rule). Only an ADMIN may touch the ADMIN account;
 * only the FOUNDER may touch the FOUNDER account; chain actors administer
 * strictly lower ranks (a manager no longer administers a fellow manager —
 * that moved up to HOD and above); the admin keeps manager-and-below. The
 * remaining safety guards — no self-disable, the last-authority rule, the
 * sole-admin rule, and the caps on role-change — are applied in the route,
 * which has the DB counts.
 */
export function assertCanAdministerTarget(actor: { role: Role }, target: { role: Role }) {
  if (!canAdministerAccountsRole(actor.role)) {
    throw new HttpError(403, "You don't have permission to manage accounts");
  }
  if (isAdminRole(target.role) && !isAdmin(actor)) {
    throw new HttpError(403, "Only an admin can manage the admin account.");
  }
  if (target.role === "FOUNDER" && actor.role !== "FOUNDER") {
    throw new HttpError(403, "Only the founder can manage the founder account.");
  }
  if (!isAdminRole(target.role) && target.role !== "PERSON" && !isAdmin(actor)) {
    const actorRank = ROLE_RANK[actor.role];
    const targetRank = ROLE_RANK[target.role];
    // Directors are peers at the top (FOUNDER folded away): they administer
    // each other; the route's self-disable and last-authority guards still hold.
    const directorPeer = actor.role === "DIRECTOR" && target.role === "DIRECTOR";
    if (targetRank >= actorRank && target.role !== "FOUNDER" && !directorPeer) {
      throw new HttpError(403, "You can only manage accounts below your own level.");
    }
  }
  if (!isAdminRole(target.role) && target.role !== "PERSON" && isAdmin(actor)) {
    if (ROLE_RANK[target.role] > ROLE_RANK.MANAGER) {
      throw new HttpError(403, "Director and department head accounts are managed by the founder.");
    }
  }
}

/**
 * Gate toggles by role. Verified is the manager's sign-off (a manager who can
 * see the project — owner or collaborator); the other four are the team's build
 * checklist and a manager does not act on them. (Admins never reach gates.)
 */
export function assertCanToggleGates(
  user: { role: Role },
  changedKeys: string[],
) {
  const touchedVerified = changedKeys.includes("verified");
  const touchedTeamGate = changedKeys.some((k) => k !== "verified");
  if (touchedVerified && !isManager(user)) {
    throw new HttpError(403, "Only a manager can move the Verified gate");
  }
  if (touchedTeamGate && isManager(user)) {
    throw new HttpError(403, "A manager doesn't move the build gates — that's the team's");
  }
}
