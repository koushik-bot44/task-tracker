import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
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

  return user;
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

/** The gate for the PERSON routine endpoints — the ONLY thing a PERSON may reach. */
export async function requirePerson(): Promise<User> {
  const user = await loadSessionUser();
  if (user.role !== "PERSON") {
    throw new HttpError(403, "Not available for this account.");
  }
  return user;
}

/** LITERALLY a MANAGER — deliberately NOT the phase-48 chain. This gate guards
    the Well Being (family routine) surface and other manager-personal features,
    which do not open up the hierarchy. Project surfaces use
    requireProjectAuthority / assertManager instead. */
export async function requireManager(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "MANAGER") {
    throw new HttpError(403, "Managers only");
  }
  return user;
}

/** The phase-48 project-authority chain: FOUNDER, DIRECTOR, HOD, or MANAGER.
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
