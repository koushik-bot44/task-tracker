/**
 * The permission matrix, in one file.
 *
 * The UI hides things; this decides them. Every rule here is enforced on the
 * server inside a route handler, and the client is free to be wrong — hiding a
 * button is a courtesy, not a control.
 *
 * Roles (phase 14 walls + the phase 48 chain + the 2026-09 restructure):
 *
 *   FOUNDER    the top of the chain. Sees and acts on everything; sets the
 *              project % by hand; records review outcomes. Exactly one.
 *   DIRECTOR   company-wide like FOUNDER, minus founder-only account powers.
 *   HOD        full authority over the projects filed in the department(s)
 *              they head, nothing beyond it.
 *   MANAGER    runs projects, SILOED to the ones they own or may manage.
 *   TEAM_LEAD  sees every project; gives tasks to anyone.
 *   RESOURCE   ("Team member") does the work; gives tasks to anyone on the
 *              projects they are on.
 *   ADMIN      runs ACCOUNTS only. Sees NO project, task, calendar or people
 *              placement.
 *   PERSON     the Well Being wall. Touches nothing here.
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
import { prisma } from "@/lib/prisma";
import { ensureMember, isOnProject } from "@/lib/project-people";

export const CAN_LEAD: Role[] = ["FOUNDER", "DIRECTOR", "HOD", "MANAGER", "TEAM_LEAD"];

export function isManager(user: { role: Role }): boolean {
  return isManagerRole(user.role);
}

export function isAdmin(user: { role: Role }): boolean {
  return isAdminRole(user.role);
}

/** The chain and leads. Admin is NOT here (phase 14 — no project access). */
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
 * ONE assignment rule (restructure): anyone on a project may give a task to
 * anyone on it. The chain and leads may also give one to someone not yet on
 * the project — that person is added to it in the same breath. A team member
 * naming someone outside the project gets a plain answer, not a 403.
 *
 * Returns nothing; throws 400/403 with copy the founder would use. The caller
 * has already checked that the actor can SEE the project.
 */
export async function assertCanAssign(
  actor: Pick<User, "id" | "role">,
  projectId: string,
  nextAssigneeId: string | null,
): Promise<void> {
  const actorOn = isLeadOrAbove(actor) || (await isOnProject(actor.id, projectId));
  if (!actorOn) throw new HttpError(403, "You're not on this project.");
  if (nextAssigneeId === null) return;

  const target = await prisma.user.findUnique({
    where: { id: nextAssigneeId },
    select: { id: true, role: true, disabledAt: true, status: true },
  });
  // Phase 35: a PERSON is not a work account and can never be assigned work.
  if (!target || target.disabledAt || target.status !== "ACTIVE" || target.role === "PERSON" || target.role === "ADMIN") {
    throw new HttpError(400, "Pick someone who is active on Orbit.");
  }
  if (await isOnProject(target.id, projectId)) return;
  if (isLeadOrAbove(actor)) {
    await ensureMember(projectId, target.id);
    return;
  }
  throw new HttpError(400, "Pick someone on this project, or ask a manager to add them.");
}

/** Who may READ the people list. */
export function assertCanListUsers(user: { role: Role }) {
  if (!canSeeUserListRole(user.role)) throw new HttpError(403, "Not allowed");
}

/**
 * Who may create/invite an account, and with which role (phase 21; phase 48
 * adds the rank rule). Chain actors create strictly below their own rank —
 * except directors, the top of the working chain, who may mint fellow
 * directors. The ADMIN actor keeps manager-and-below. FOUNDER and PERSON are
 * never mintable here.
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
  if (newRole === "PERSON") {
    throw new HttpError(403, "A person account is created from the Family tab.");
  }
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
 * Who may disable/enable, reset, re-role, place or delete a GIVEN account.
 * Only an ADMIN may touch the ADMIN account; only the FOUNDER the FOUNDER
 * account; chain actors administer strictly lower ranks (directors are peers);
 * the admin keeps manager-and-below.
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
