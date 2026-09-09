import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { GROUP_INCLUDE, assertCanShapeDepartment, serializeGroup, workAccounts } from "@/lib/work/org";
import { parseBody, updateGroupSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  await loadScope(user);
  const g = await prisma.assignmentGroup.findUnique({ where: { id: params.id }, include: GROUP_INCLUDE });
  if (!g) throw new HttpError(404, "Team not found");
  return NextResponse.json(serializeGroup(g));
});

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  const g = await prisma.assignmentGroup.findUnique({ where: { id: params.id }, select: { departmentId: true } });
  if (!g) throw new HttpError(404, "Team not found");
  assertCanShapeDepartment(user, scope, g.departmentId);
  const parsed = await parseBody(req, updateGroupSchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.leadId) {
    const ok = await workAccounts([parsed.data.leadId]);
    if (!ok.length) throw new HttpError(400, "Pick someone active on Orbit to lead the team.");
    await prisma.assignmentGroupMember.upsert({ where: { groupId_userId: { groupId: params.id, userId: parsed.data.leadId } }, update: {}, create: { groupId: params.id, userId: parsed.data.leadId } });
  }
  const updated = await prisma.assignmentGroup.update({ where: { id: params.id }, data: parsed.data, include: GROUP_INCLUDE });
  return NextResponse.json(serializeGroup(updated));
});

/** A team with open work cannot go; give the work to another team first. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  const g = await prisma.assignmentGroup.findUnique({ where: { id: params.id }, select: { departmentId: true } });
  if (!g) throw new HttpError(404, "Team not found");
  assertCanShapeDepartment(user, scope, g.departmentId);
  const open = await prisma.task.count({ where: { assignmentGroupId: params.id, deletedAt: null, state: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "ESCALATED", "REOPENED"] } } });
  if (open > 0) return NextResponse.json({ error: `This team still holds ${open} open task${open === 1 ? "" : "s"}. Move them first.` }, { status: 409 });
  await prisma.assignmentGroup.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
