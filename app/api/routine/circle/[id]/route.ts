import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager, route } from "@/lib/session";
import { circleUpdateSchema, parseBody } from "@/lib/validation";
import { personParam, requireCircleMember, requireRoutineAccess, serializeCircleMember } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Change what a circle member is allowed or teaches: `permission` applies to a
    co-parent, `subject` to a tutor; the one that does not fit is ignored. Owner only. */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });
  const row = await requireCircleMember(person.id, params.id);

  const parsed = await parseBody(req, circleUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { permission, subject } = parsed.data;

  const data: { permission?: string; subject?: string | null } = {};
  if (row.kind === "FAMILY" && permission !== undefined) data.permission = permission;
  if (row.kind === "MENTOR" && subject !== undefined) data.subject = subject || null;
  if (Object.keys(data).length === 0) return NextResponse.json(serializeCircleMember(row));

  const updated = await prisma.routineCollaborator.update({
    where: { id: row.id },
    data,
    select: { id: true, managerId: true, kind: true, subject: true, permission: true, manager: { select: { name: true, email: true, status: true } } },
  });
  return NextResponse.json(serializeCircleMember(updated));
});

/** Take someone out of the circle. Their walled login goes with them, and with it
    the circle row, a tutor's reports and any unused invite link (cascades). A row
    that still points at a work account (the older monitoring-manager kind) drops
    only the row — a colleague's login is never deleted from here. Owner only. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });
  const row = await requireCircleMember(person.id, params.id);

  const login = await prisma.user.findUnique({ where: { id: row.managerId }, select: { role: true } });
  if (login?.role === "PERSON") {
    await prisma.user.delete({ where: { id: row.managerId } });
  } else {
    await prisma.routineCollaborator.delete({ where: { id: row.id } });
  }
  return NextResponse.json({ ok: true });
});
