import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { CATEGORY_INCLUDE, assertCanShapeDepartment, serializeCategory } from "@/lib/work/org";
import { createCategorySchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  await loadScope(user);
  const rows = await prisma.taskCategory.findMany({ orderBy: { orderKey: "asc" }, include: CATEGORY_INCLUDE });
  return NextResponse.json(rows.map(serializeCategory));
});

/** A category (and its default team). The CEO anywhere; a head inside their department. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const scope = await loadScope(user);
  const parsed = await parseBody(req, createCategorySchema);
  if (!parsed.ok) return parsed.response;
  const { name, parentId, departmentId, assignmentGroupId } = parsed.data;
  if (departmentId) assertCanShapeDepartment(user, scope, departmentId);
  else if (!scope.all) throw new HttpError(403, "Only the CEO makes a company-wide category.");
  if (assignmentGroupId) {
    const g = await prisma.assignmentGroup.findUnique({ where: { id: assignmentGroupId }, select: { departmentId: true } });
    if (!g) throw new HttpError(400, "That team does not exist.");
  }
  const last = await prisma.taskCategory.findFirst({ where: { parentId: parentId ?? null }, orderBy: { orderKey: "desc" }, select: { orderKey: true } });
  const created = await prisma.taskCategory.create({
    data: { name, parentId: parentId ?? null, departmentId: departmentId ?? null, assignmentGroupId: assignmentGroupId ?? null, orderKey: generateKeyBetween(last?.orderKey ?? null, null) },
    include: CATEGORY_INCLUDE,
  });
  return NextResponse.json(serializeCategory(created), { status: 201 });
});
