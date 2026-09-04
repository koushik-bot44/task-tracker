import { NextResponse } from "next/server";
import { z } from "zod";
import { issueInvite } from "@/lib/invite";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/serialize";
import { assertCanCreateUserWithRole, assertCanListUsers } from "@/lib/permissions";
import { adminAlreadyExists } from "@/lib/account-guards";
import { requireUser, route } from "@/lib/session";
import { parseBody, roleSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().min(3).max(320),
  role: roleSchema,
  /** Restructure: where the new person sits on the People page. */
  departmentId: z.string().min(1).nullable().optional(),
});

/* Leads read this list because they cannot give work to someone they cannot
   see. It carries no secrets — names, emails, roles, placement, enabled state. */
export const GET = route(async () => {
  const actor = await requireUser();
  assertCanListUsers(actor);

  const users = await prisma.user.findMany({
    where: { role: { not: "PERSON" } },
    orderBy: { createdAt: "asc" },
    include: { department: { select: { name: true } } },
  });
  const managerIds = users
    .filter((u) => u.role === "FOUNDER" || u.role === "DIRECTOR" || u.role === "HOD" || u.role === "MANAGER")
    .map((u) => u.id);
  const grouped = managerIds.length
    ? await prisma.project.groupBy({ by: ["ownerId"], where: { ownerId: { in: managerIds } }, _count: { _all: true } })
    : [];
  const owned = new Map(grouped.map((g) => [g.ownerId, g._count._all]));
  return NextResponse.json(users.map((u) => serializeUser(u, owned.get(u.id) ?? 0)));
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

  const email = parsed.data.email.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email does not look right." }, { status: 400 });
  }

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash) {
    return NextResponse.json({ error: "Someone already has that email." }, { status: 409 });
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

  const { sent } = await issueInvite({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    inviterName: actor.name,
    createdById: actor.id,
  });

  return NextResponse.json({ user: serializeUser(user), emailSent: sent }, { status: 201 });
});
