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
    // Phase 32: a manager/admin may set an attendee's WhatsApp number so meeting
    // alerts can reach them. "" / null clears it; an invalid value is a 400.
    phone: phoneInput,
  })
  .partial();

/**
 * Change an account (phase 21: shared account admin; phase 48: the rank rule).
 *
 * Guards, in force:
 *  - Only an ADMIN may touch the ADMIN account; only the FOUNDER touches the
 *    FOUNDER account; chain actors touch strictly lower ranks (permissions.ts).
 *  - Nobody disables their OWN account.
 *  - The last active PROJECT AUTHORITY (founder/director/HOD/manager) cannot be
 *    disabled or demoted out of the chain — the company must always keep
 *    someone who can own and run projects (was the last-manager rule).
 *  - The SOLE admin cannot disable itself or demote itself out of admin.
 *  - Promoting TO admin is refused while an admin exists (single-admin cap).
 *  - FOUNDER is never granted, and the founder's role never changed, here —
 *    founder transfer is a controlled promotion outside the UI.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireAccountAdmin();

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { role, disable, reset, phone } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Per-target authority (admin account, founder account, rank rule) before any
  // per-action guard runs.
  assertCanAdministerTarget(actor, target);

  if (disable === true && target.id === actor.id) {
    throw new HttpError(403, "You cannot disable your own account.");
  }

  if (role === "FOUNDER" && target.role !== "FOUNDER") {
    throw new HttpError(403, "The founder role can't be granted from here.");
  }
  if (target.role === "FOUNDER" && role !== undefined && role !== "FOUNDER") {
    throw new HttpError(403, "The founder's role can't be changed from here.");
  }
  if (role === "PERSON" && target.role !== "PERSON") {
    throw new HttpError(403, "A person account is created from the Well Being tab.");
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

  // Sole-admin self guard: the only admin cannot disable or demote itself.
  const removesAdmin =
    target.role === "ADMIN" &&
    (disable === true || (role !== undefined && role !== "ADMIN"));
  if (removesAdmin && target.id === actor.id && (await otherAdmins(target.id)) === 0) {
    throw new HttpError(
      403,
      "You're the only admin — you can't disable or demote your own admin account.",
    );
  }

  // Single-admin cap on promotion: granting admin is admin-only, and blocked
  // entirely while an admin already exists.
  if (role === "ADMIN" && target.role !== "ADMIN") {
    if (!isAdmin(actor)) {
      throw new HttpError(403, "Only an admin can grant the admin role.");
    }
    if (await adminAlreadyExists()) {
      return NextResponse.json({ error: "There can only be one admin account." }, { status: 409 });
    }
  }

  const data: { role?: UserRole; disabledAt?: Date | null; passwordHash?: string; phone?: string | null } = {};
  if (role !== undefined) data.role = role;
  if (disable !== undefined) data.disabledAt = disable ? new Date() : null;
  if (phone !== undefined) data.phone = phone;

  let tempPassword: string | undefined;
  if (reset) {
    tempPassword = generateTempPassword();
    data.passwordHash = await hashPassword(tempPassword);
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({
    user: serializeUser(updated),
    ...(tempPassword ? { tempPassword } : {}),
  });
});

/**
 * Delete an account (account admin only).
 *
 * PHASE 29 — a user who OWNS any project can NO LONGER be deleted (409): the
 * owner must reassign or delete those projects first. This REVERSES the prior
 * behavior in two ways: (a) deleting a manager no longer CASCADE-deletes the
 * projects they own — it is refused while they own any; (b) an account that owns
 * NOTHING is now deletable regardless of role (a developer/lead who is only a
 * member/collaborator, or a manager with no owned projects) — it is no longer
 * "disable, never delete". Being only a member/collaborator of OTHERS' projects
 * does not block deletion; those rows are just removed. Self-delete, the admin-
 * target guard, and the last-manager guard all still apply.
 *
 *  - A PENDING invite is simply cancelled.
 *  - OWNS >=1 project -> 409 with the count; nothing is deleted.
 *  - Otherwise the account + its authored content is removed (see below).
 */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const actor = await requireAccountAdmin();

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // Only an admin manages the admin account; and nobody deletes their own.
  assertCanAdministerTarget(actor, target);
  if (target.id === actor.id) {
    throw new HttpError(403, "You cannot delete your own account.");
  }

  if (target.status === "PENDING") {
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true, deletedProjects: 0 });
  }

  // Owning projects BLOCKS deletion (phase 29) — reassign/remove them first.
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

  // The last active project authority must remain (they own and run projects).
  if (isManagerRole(target.role) && (await otherActiveAuthorities(target.id)) === 0) {
    throw new HttpError(403, "You can't delete the last account that can run projects — promote someone else first.");
  }

  await prisma.$transaction(async (tx) => {
    // The account's authored/created content, which would otherwise wall off the
    // delete (these FKs are Restrict). No owned-project cascade — owning any
    // project was refused above. Departments are COMPANY-WIDE since phase 48 and
    // are never deleted with a user — their createdById FK is SetNull now.
    await tx.taskNote.deleteMany({ where: { authorId: target.id } });
    await tx.projectNote.deleteMany({ where: { authorId: target.id } });
    await tx.invite.deleteMany({ where: { createdById: target.id } });
    await tx.calendarEvent.deleteMany({ where: { createdById: target.id } });
    // Finally the account. Cascades their memberships and collaborator rows on
    // others' projects (those survive), notifications, push subs, etc.; SetNulls
    // their lead/assignee/completedBy references in surviving rows.
    await tx.user.delete({ where: { id: target.id } });
  });

  return NextResponse.json({ ok: true, deletedProjects: 0 });
});
