import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { GROUP_INCLUDE, assertCanShapeGroup, serializeGroup, workAccounts } from "@/lib/work/org";
import { groupMembersSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Put people on the team. */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  await assertCanShapeGroup(user, scope, params.id);
  const parsed = await parseBody(req, groupMembersSchema);
  if (!parsed.ok) return parsed.response;
  const ids = await workAccounts(parsed.data.userIds);
  if (!ids.length) throw new HttpError(400, "Pick people who are active on Orbit.");
  await prisma.assignmentGroupMember.createMany({ data: ids.map((userId) => ({ groupId: params.id, userId })), skipDuplicates: true });
  const g = await prisma.assignmentGroup.findUnique({ where: { id: params.id }, include: GROUP_INCLUDE });
  return NextResponse.json(serializeGroup(g!));
});

/** Take people off the team. Their held tasks stay theirs until someone moves them. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  await assertCanShapeGroup(user, scope, params.id);
  const parsed = await parseBody(req, groupMembersSchema);
  if (!parsed.ok) return parsed.response;
  await prisma.assignmentGroupMember.deleteMany({ where: { groupId: params.id, userId: { in: parsed.data.userIds } } });
  const stillHeld = await prisma.task.count({ where: { assignmentGroupId: params.id, assigneeId: { in: parsed.data.userIds }, deletedAt: null, state: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "ESCALATED", "REOPENED"] } } });
  const g = await prisma.assignmentGroup.findUnique({ where: { id: params.id }, include: GROUP_INCLUDE });
  return NextResponse.json({ ...serializeGroup(g!), stillHeldTasks: stillHeld });
});
