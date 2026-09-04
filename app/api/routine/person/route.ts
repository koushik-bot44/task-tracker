import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { requireManager, route } from "@/lib/session";
import { parseBody, routinePersonUpdateSchema } from "@/lib/validation";
import { personParam, requireRoutineAccess } from "@/lib/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edit the person's login account: rename, change login email, reset password.
    OWNER only — managing the login account is not a collaborator write. */
export const PATCH = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });

  const parsed = await parseBody(req, routinePersonUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { name, email, password } = parsed.data;

  if (name !== undefined) {
    await prisma.person.update({ where: { id: person.id }, data: { name } });
    // Keep the login account's display name in step with the person's name.
    await prisma.user.update({ where: { id: person.userId }, data: { name } });
  }
  if (password !== undefined) {
    await prisma.user.update({ where: { id: person.userId }, data: { passwordHash: await hashPassword(password) } });
  }
  if (email !== undefined) {
    const normalized = email.trim().toLowerCase();
    const conflict = await prisma.user.findFirst({ where: { email: normalized, id: { not: person.userId } }, select: { id: true } });
    if (conflict) return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    await prisma.user.update({ where: { id: person.userId }, data: { email: normalized } });
  }
  const fresh = await prisma.person.findUnique({ where: { id: person.id }, select: { id: true, name: true, user: { select: { email: true } } } });
  return NextResponse.json({ id: fresh!.id, name: fresh!.name, loginEmail: fresh!.user.email });
});

/** Remove the person: deleting the PERSON login account cascades the Person row
    and ALL routine data (segments, habits, marks, non-negotiables, weight, tasks,
    AND its RoutineCollaborator rows). OWNER only. Destructive — confirmed in the UI. */
export const DELETE = route(async (req: Request) => {
  const actor = await requireManager();
  const { person } = await requireRoutineAccess(actor.id, personParam(req), { ownerOnly: true });
  await prisma.user.delete({ where: { id: person.userId } });
  return NextResponse.json({ ok: true });
});
