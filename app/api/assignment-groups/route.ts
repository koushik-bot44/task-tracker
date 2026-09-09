import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { GROUP_INCLUDE, assertCanShapeDepartment, serializeGroup, workAccounts } from "@/lib/work/org";
import { createGroupSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every team (the org chart is not a secret inside the company). ?departmentId= narrows. */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  await loadScope(user);
  const departmentId = new URL(req.url).searchParams.get("departmentId") ?? undefined;
  const rows = await prisma.assignmentGroup.findMany({ where: { ...(departmentId ? { departmentId } : {}) }, orderBy: [{ department: { orderKey: "asc" } }, { orderKey: "asc" }], include: GROUP_INCLUDE });
  return NextResponse.json(rows.map(serializeGroup));
});

/** A team in a department: the CEO anywhere, a head in theirs. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  const parsed = await parseBody(req, createGroupSchema);
  if (!parsed.ok) return parsed.response;
  const { departmentId, name, description, leadId, memberIds } = parsed.data;
  assertCanShapeDepartment(user, scope, departmentId);
  const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!dept) throw new HttpError(400, "That department does not exist.");
  const clash = await prisma.assignmentGroup.findUnique({ where: { departmentId_name: { departmentId, name } } });
  if (clash) throw new HttpError(409, "There is already a team with that name here.");
  const people = await workAccounts([...(memberIds ?? []), ...(leadId ? [leadId] : [])]);
  if (leadId && !people.includes(leadId)) throw new HttpError(400, "Pick someone active on Orbit to lead the team.");
  const last = await prisma.assignmentGroup.findFirst({ where: { departmentId }, orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const created = await prisma.assignmentGroup.create({
    data: {
      departmentId,
      name,
      description: description ?? "",
      leadId: leadId ?? null,
      orderKey: generateKeyBetween(last?.orderKey ?? null, null),
      members: { create: [...new Set(people)].map((userId) => ({ userId })) },
    },
    include: GROUP_INCLUDE,
  });
  return NextResponse.json(serializeGroup(created), { status: 201 });
});
