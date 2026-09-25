import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma, type User } from "@prisma/client";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAdministerAccountsRole, isManagerRole } from "@/lib/roles";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

/**
 * Verify the token, then load the user from the database on every request.
 *
 * The extra round trip is the point: it is what makes "disable this account"
 * take effect immediately rather than whenever a 30-day cookie happens to
 * expire. A signed token proves who minted it, not that they are still welcome.
 */
async function loadSessionUser(): Promise<User> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const claims = await readSessionToken(token);
  if (!claims) throw new HttpError(401, "Unauthorized");

  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
  if (!user || user.disabledAt) throw new HttpError(401, "Unauthorized");
  // A password set or reset bumps the version: every cookie minted before it stops working.
  if (user.sessionVersion !== claims.version) throw new HttpError(401, "Unauthorized");

  return user;
}

/**
 * 2026-09-25 (the circle): every login around the tracked person carries the
 * PERSON role, so the work app's walls hold for all of them without a new role.
 * WHICH one they are is data: the tracked person has a Person row (SON); a
 * co-parent has an accepted FAMILY collaborator row; a tutor or coach a MENTOR
 * one. Decided here, once, for the three gates below and for /api/routine/who.
 */
export type WalledKind = "SON" | "FAMILY" | "MENTOR";
export async function walledKind(userId: string): Promise<WalledKind | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      personAccount: { select: { id: true } },
      routineCollaborations: { where: { status: "ACCEPTED" }, select: { kind: true } },
    },
  });
  if (!u) return null;
  if (u.personAccount) return "SON";
  const kinds = new Set(u.routineCollaborations.map((c) => c.kind));
  if (kinds.has("MENTOR")) return "MENTOR";
  if (kinds.has("FAMILY")) return "FAMILY";
  return null;
}

/**
 * The gate for every WORK route. A PERSON (phase 35, was CHILD) is a walled-off
 * login that may touch nothing here — so requireUser REJECTS it with a 403.
 * Because every work handler funnels through requireUser (directly, or via
 * requireManager / requireAdmin / requireAccountAdmin which call it), this one
 * line 403s a PERSON on the entire work API. The person's own routine endpoints
 * use requirePerson.
 */
export async function requireUser(): Promise<User> {
  const user = await loadSessionUser();
  if (user.role === "PERSON") {
    throw new HttpError(403, "Not available for this account.");
  }
  return user;
}

/** The gate for the tracked person's own endpoints (/api/routine/kid): a PERSON
    login that IS the tracked person. A co-parent or a tutor, though also PERSON-
    role, is refused here (2026-09-25). */
export async function requirePerson(): Promise<User> {
  const user = await loadSessionUser();
  if (user.role !== "PERSON" || (await walledKind(user.id)) !== "SON") {
    throw new HttpError(403, "Not available for this account.");
  }
  return user;
}

/** Any login around the tracked person (the person, a co-parent, a tutor) —
    only /api/routine/who uses it, to say which screen to show. */
export async function requireWalled(): Promise<{ user: User; kind: WalledKind }> {
  const user = await loadSessionUser();
  const kind = user.role === "PERSON" ? await walledKind(user.id) : null;
  if (!kind) throw new HttpError(403, "Not available for this account.");
  return { user, kind };
}

/** The gate for the tutor/coach endpoints (/api/routine/mentor). */
export async function requireMentor(): Promise<User> {
  const user = await loadSessionUser();
  if (user.role !== "PERSON" || (await walledKind(user.id)) !== "MENTOR") {
    throw new HttpError(403, "Not available for this account.");
  }
  return user;
}

/** The Well Being (family routine) surface belongs to the CEO (owner,
    2026-09-04: "Well Being is only for Rahul to track someone") — and, since
    2026-09-25, to a co-parent he invited, who opens the same screens from a
    walled login at the permission he granted (what they may touch is settled
    per request by requireRoutineAccess). Deliberately NOT the phase-48 chain.
    Project surfaces use requireProjectAuthority / assertManager instead. The
    name is kept so nothing else has to move. */
export async function requireManager(): Promise<User> {
  const user = await loadSessionUser();
  if (user.role === "FOUNDER") return user;
  if (user.role === "PERSON" && (await walledKind(user.id)) === "FAMILY") return user;
  throw new HttpError(403, "Only the CEO has Well Being.");
}

/** The project-authority chain: the CEO, an HOD, or a MANAGER.
    What each may actually reach is scoped by lib/project-visibility. */
export async function requireProjectAuthority(): Promise<User> {
  const user = await requireUser();
  if (!isManagerRole(user.role)) {
    throw new HttpError(403, "You don't have permission to do this");
  }
  return user;
}

/** The accounts role (phase 14): people + password resets, nothing project. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new HttpError(403, "Admins only");
  }
  return user;
}

/** Account administration (phase 21): managers and admins are peers on people —
    create/disable/reset/role-change. Which specific accounts they may touch is
    settled per-target in the route (only an admin manages the admin). */
export async function requireAccountAdmin(): Promise<User> {
  const user = await requireUser();
  if (!canAdministerAccountsRole(user.role)) {
    throw new HttpError(403, "Only a manager or admin can manage accounts");
  }
  return user;
}

/** Turns a thrown HttpError into its response; rethrows anything unexpected. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  // Two presses racing each other (2026-09-11): the second save of the same record,
  // or the second delete of one already gone, is a conflict, not a crash.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "That has already been saved." }, { status: 409 });
    if (error.code === "P2025") return NextResponse.json({ error: "That is no longer there." }, { status: 404 });
  }
  console.error("[api] unhandled error:", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

/** Wraps a route handler so permission checks can simply throw. */
export function route<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
