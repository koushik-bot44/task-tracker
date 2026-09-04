import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { parseBody, updatePersonalDepartmentSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Owner-scoped lookup — the isolation door. Another user's dept is a 404. */
async function own(ownerId: string, id: string) {
  return prisma.personalDepartment.findFirst({ where: { id, ownerId }, select: { id: true } });
}

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  if (!(await own(user.id, params.id))) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }
  const parsed = await parseBody(req, updatePersonalDepartmentSchema);
  if (!parsed.ok) return parsed.response;
  const { name, orderKey } = parsed.data;
  const dept = await prisma.personalDepartment.update({
    where: { id: params.id },
    data: { ...(name !== undefined ? { name } : {}), ...(orderKey !== undefined ? { orderKey } : {}) },
    select: { id: true, name: true, orderKey: true, _count: { select: { projects: true } } },
  });
  return NextResponse.json({ id: dept.id, name: dept.name, orderKey: dept.orderKey, projectCount: dept._count.projects });
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  if (!(await own(user.id, params.id))) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }
  // Mirror the main app: block deleting a non-empty department (move its projects
  // out first), rather than a silent cascade.
  const projectCount = await prisma.personalProject.count({ where: { departmentId: params.id, ownerId: user.id } });
  if (projectCount > 0) {
    return NextResponse.json(
      { error: `This department still holds ${projectCount} project${projectCount === 1 ? "" : "s"}. Move or delete them first.` },
      { status: 409 },
    );
  }
  await prisma.personalDepartment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
