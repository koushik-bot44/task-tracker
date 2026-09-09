import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError, requireUser, route } from "@/lib/session";
import { loadScope } from "@/lib/work/access";
import { CATEGORY_INCLUDE, assertCanShapeDepartment, serializeCategory } from "@/lib/work/org";
import { parseBody, updateCategorySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function shaper(actor: { id: string; role: Role }, id: string) {
  const scope = await loadScope(actor);
  const c = await prisma.taskCategory.findUnique({ where: { id }, select: { departmentId: true } });
  if (!c) throw new HttpError(404, "Category not found");
  if (c.departmentId) assertCanShapeDepartment(actor, scope, c.departmentId);
  else if (!scope.all) throw new HttpError(403, "Only the CEO changes a company-wide category.");
}

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  await shaper(user, params.id);
  const parsed = await parseBody(req, updateCategorySchema);
  if (!parsed.ok) return parsed.response;
  const updated = await prisma.taskCategory.update({ where: { id: params.id }, data: parsed.data, include: CATEGORY_INCLUDE });
  return NextResponse.json(serializeCategory(updated));
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  await shaper(user, params.id);
  await prisma.taskCategory.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
