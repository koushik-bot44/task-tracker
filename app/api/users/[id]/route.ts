import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTempPassword, hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/serialize";
import type { UserRole } from "@/lib/types";
import { HttpError, requireAccountAdmin, route } from "@/lib/session";
import { assertCanAdministerTarget, isAdmin } from "@/lib/permissions";
import { adminAlreadyExists, otherActiveAuthorities, otherAdmins } from "@/lib/account-guards";
import { isManagerRole } from "@/lib/roles";
import { parseBody, phoneInput, roleSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const patchSchema = z
  .object({
    role: roleSchema,
    disable: z.boolean(),
    reset: z.literal(true),
    phone: phoneInput,
    /** Restructure: place someone in a department (null = "Not placed yet"). */
    departmentId: z.string().min(1).nullable(),
  })
  .partial();

/**
 * Change an account (phase 21 shared admin; phase 48 rank rule; restructure
 * adds placement). Guards, in force:
 *  - Only an ADMIN may touch the ADMIN account; only the FOUNDER the FOUNDER
 *    account; chain actors touch strictly lower ranks (permissions.ts).
 *  - Nobody disables their OWN account.
 *  - The last active project authority cannot be disabled or demoted.
 *  - The SOLE admin cannot disable or demote itself.
 *  - Promoting TO admin is refused while an admin exists.
 *  - FOUNDER is never granted, and the founder's role never changed, here.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireAccountAdmin();

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { role, disable, reset, phone, departmentId } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  assertCanAdministerTarget(actor, target);

  if (disable === true && target.id === actor.id) {
    throw new HttpError(403, "You cannot disable your own account.");
  }

  if (role === "FOUNDER" && target.role !== "FOUNDER") {
    throw new HttpError(403, "The CEO role can't be granted from here.");
  }
  if (target.role === "FOUNDER" && role !== undefined && role !== "FOUNDER") {
    throw new HttpError(403, "The CEO's role can't be changed from here.");
  }
  if (role === "PERSON" && target.role !== "PERSON") {
    throw new HttpError(403, "A person account is created from the Family tab.");
  }

  const removesAuthority =
    isManagerRole(target.role) &&
    (disable === true || (role !== undefined && !isManagerRole(role)));
  if (removesAuthority && (await otherActiveAuthorities(target.id)) === 0) {
    throw new HttpError(
      403,
      "You can't remove the last account that can run projects — promote someone else first.",
    );
  }

  const removesAdmin =
    target.role === "ADMIN" &&
    (disable === true || (role !== undefined && role !== "ADMIN"));
  if (removesAdmin && target.id === actor.id && (await otherAdmins(target.id)) === 0) {
    throw new HttpError(
      403,
      "You're the only admin — you can't disable or demote your own admin account.",
    );
  }

  if (role === "ADMIN" && target.role !== "ADMIN") {
    if (!isAdmin(actor)) {
      throw new HttpError(403, "Only an admin can grant the admin role.");
    }
    if (await adminAlreadyExists()) {
      return NextResponse.json({ error: "There can only be one admin account." }, { status: 409 });
    }
  }

  if (departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!dept) return NextResponse.json({ error: "That department does not exist." }, { status: 400 });
  }

  const data: { role?: UserRole; disabledAt?: Date | null; passwordHash?: string; phone?: string | null; departmentId?: string | null } = {};
  if (role !== undefined) data.role = role;
  if (disable !== undefined) data.disabledAt = disable ? new Date() : null;
  if (phone !== undefined) data.phone = phone;
  if (departmentId !== undefined) data.departmentId = departmentId;

  let tempPassword: string | undefined;
  if (reset) {
    tempPassword = generateTempPassword();
    data.passwordHash = await hashPassword(tempPassword);
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data, include: { department: { select: { name: true } } } });
  return NextResponse.json({
    user: serializeUser(updated),
    ...(tempPassword ? { tempPassword } : {}),
  });
});

/**
 * Delete an account (account admin only). A user who OWNS any project cannot
 * be deleted (409): reassign or delete those projects first. A PENDING invite
 * is simply cancelled. Self-delete, the admin-target guard and the
 * last-authority guard all apply.
 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireAccountAdmin();

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  assertCanAdministerTarget(actor, target);
  if (target.id === actor.id) {
    throw new HttpError(403, "You cannot delete your own account.");
  }

  if (target.status === "PENDING") {
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, deletedProjects: 0 });
  }

  const owned = await prisma.project.count({ where: { ownerId: target.id } });
  if (owned > 0) {
    return NextResponse.json(
      {
        error: `This account owns ${owned} project${owned === 1 ? "" : "s"}. Reassign or delete ${owned === 1 ? "it" : "them"} first, then delete the account.`,
        ownedProjectCount: owned,
      },
      { status: 409 },
    );
  }

  if (isManagerRole(target.role) && (await otherActiveAuthorities(target.id)) === 0) {
    throw new HttpError(403, "You can't delete the last account that can run projects — promote someone else first.");
  }

  await prisma.$transaction(async (tx) => {
    // Authored content that would otherwise wall off the delete (Restrict FKs).
    await tx.comment.deleteMany({ where: { authorId: target.id } });
    await tx.invite.deleteMany({ where: { createdById: target.id } });
    await tx.calendarEvent.deleteMany({ where: { createdById: target.id } });
    await tx.user.delete({ where: { id: target.id } });
  });

  return NextResponse.json({ ok: true, deletedProjects: 0 });
});
