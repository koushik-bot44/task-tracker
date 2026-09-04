import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, route } from "@/lib/session";
import { parseBody, updatePersonalProjectSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function own(ownerId: string, id: string) {
  return prisma.personalProject.findFirst({ where: { id, ownerId }, select: { id: true } });
}

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  if (!(await own(user.id, params.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const parsed = await parseBody(req, updatePersonalProjectSchema);
  if (!parsed.ok) return parsed.response;
  const { name, orderKey } = parsed.data;
  const project = await prisma.personalProject.update({
    where: { id: params.id },
    data: { ...(name !== undefined ? { name } : {}), ...(orderKey !== undefined ? { orderKey } : {}) },
    select: { id: true, name: true, orderKey: true, departmentId: true },
  });
  return NextResponse.json(project);
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  if (!(await own(user.id, params.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  // Deleting a personal project removes its tasks with it (they live nowhere else).
  // Scoped to the caller's own private tasks; TaskNote + subtask rows cascade at
  // the DB. The personalProjectId FK is SetNull as a safety net, but we delete
  // explicitly so nothing is orphaned into an invisible bucket.
  await prisma.task.deleteMany({ where: { personalProjectId: params.id, ownerId: user.id, isPrivate: true } });
  await prisma.personalProject.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
});
