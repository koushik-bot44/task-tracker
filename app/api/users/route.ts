import { NextResponse } from "next/server";
import { z } from "zod";
import { issueInvite } from "@/lib/invite";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/serialize";
import { assertCanCreateUserWithRole, assertCanListUsers } from "@/lib/permissions";
import { adminAlreadyExists } from "@/lib/account-guards";
import { canAdministerAccountsRole, isAdminRole, isExecutiveRole } from "@/lib/roles";
import { requireUser, route } from "@/lib/session";
import { addOtherEmails, dedupeEmails, isEmailShaped, takenEmails } from "@/lib/user-emails";
import { parseBody, roleSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().min(3).max(320),
  /** One person, several addresses: extras beyond the main `email` above. Any
      of them signs in; the invite itself goes to the main one. */
  emails: z.array(z.string().trim().min(3).max(320)).max(10).optional(),
  role: roleSchema,
  /** Restructure: where the new person sits on the People page. */
  departmentId: z.string().min(1).nullable().optional(),
});

/* Leads read this list because they cannot give work to someone they cannot
   see. It carries no secrets — names, emails, roles, placement, enabled state. */
export const GET = route(async () => {
  const actor = await requireUser();
  assertCanListUsers(actor);

  // Owner, 2026-09-04: only the CEO (and the admin who runs
  // accounts) sees everyone. Everyone else sees their own department, any
  // department they head, the CEO, and themselves.
  const wide = isExecutiveRole(actor.role) || isAdminRole(actor.role);
  const headed = wide ? [] : await prisma.department.findMany({ where: { hodId: actor.id }, select: { id: true } });
  const departmentIds = [...(actor.departmentId ? [actor.departmentId] : []), ...headed.map((d) => d.id)];
  const users = await prisma.user.findMany({
    where: wide
      ? { role: { not: "PERSON" } }
      : {
          role: { not: "PERSON" },
          OR: [
            ...(departmentIds.length ? [{ departmentId: { in: departmentIds } }] : []),
            { id: actor.id },
            { role: { in: ["FOUNDER", "CO_FOUNDER"] as const } },
          ],
        },
    orderBy: { createdAt: "asc" },
    include: {
      department: { select: { name: true } },
      otherEmails: { select: { email: true }, orderBy: { createdAt: "asc" } },
    },
  });
  const managerIds = users
    .filter((u) => u.role === "FOUNDER" || u.role === "CO_FOUNDER" || u.role === "HOD" || u.role === "MANAGER")
    .map((u) => u.id);
  const grouped = managerIds.length
    ? await prisma.project.groupBy({ by: ["ownerId"], where: { ownerId: { in: managerIds } }, _count: { _all: true } })
    : [];
  const owned = new Map(grouped.map((g) => [g.ownerId, g._count._all]));
  // A phone number is for whoever runs accounts, and for the person themselves.
  const admin = canAdministerAccountsRole(actor.role);
  return NextResponse.json(
    users.map((u) => {
      const dto = serializeUser(u, owned.get(u.id) ?? 0);
      return admin || u.id === actor.id ? dto : { ...dto, phone: null };
    }),
  );
});

/**
 * Invites a new teammate. The account is created immediately in a PENDING state
 * with NO password, and an email goes out with a single-use set-password link.
 */
export const POST = route(async (req: Request) => {
  const actor = await requireUser();

  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;

  assertCanCreateUserWithRole(actor, parsed.data.role);
  if (parsed.data.role === "ADMIN" && (await adminAlreadyExists())) {
    return NextResponse.json({ error: "There can only be one admin account." }, { status: 409 });
  }

  // The first address is the main one; the rest are the same person's other
  // inboxes. All of them are checked before anything is written, so a clash
  // never leaves a half-made account behind.
  const [email, ...others] = dedupeEmails([parsed.data.email, ...(parsed.data.emails ?? [])]);
  const malformed = [email, ...others].filter((e) => !isEmailShaped(e));
  if (malformed.length) {
    return NextResponse.json(
      { error: malformed.length === 1 ? `${malformed[0]} does not look like an email.` : "Some of those do not look like emails." },
      { status: 400 },
    );
  }

  const clash = await takenEmails([email, ...others]);
  if (clash.length) {
    return NextResponse.json(
      { error: clash.length === 1 && clash[0] === email ? "Someone already has that email." : `Someone already has ${clash.join(", ")}.` },
      { status: 409 },
    );
  }

  if (parsed.data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: parsed.data.departmentId }, select: { id: true } });
    if (!dept) return NextResponse.json({ error: "That department does not exist." }, { status: 400 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      status: "PENDING",
      passwordHash: null,
      departmentId: parsed.data.departmentId ?? null,
    },
    include: { department: { select: { name: true } } },
  });
  await addOtherEmails(user.id, others);

  const { sent } = await issueInvite({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    inviterName: actor.name,
    createdById: actor.id,
  });

  return NextResponse.json(
    { user: { ...serializeUser(user), emails: [email, ...others] }, emailSent: sent },
    { status: 201 },
  );
});
