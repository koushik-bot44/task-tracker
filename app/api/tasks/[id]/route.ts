import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { deleteWork, loadWork, updateWork } from "@/lib/work/tasks";
import { badRequest, parseBody, updateTaskSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * A single task, with what the caller may do to it (`access`), so the drawer
 * and the record page hide exactly what the server would refuse.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const { row, access } = await loadWork(user, params.id);
  if (row.deletedAt) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ ...serializeTask(row), access });
});

/**
 * Change a task (work model). Every rule — who may edit, who may assign,
 * which status moves exist, what a step may do — lives in lib/work/tasks.ts.
 * The old screens' `status` word is translated into recorded moves there.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();

  const parsed = await parseBody(req, updateTaskSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  // Private notes keep their own small path: owner-only, four words, no people.
  const existing = await prisma.task.findUnique({ where: { id: params.id }, select: { isPrivate: true, ownerId: true } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (existing.isPrivate) {
    if (existing.ownerId !== user.id) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (patch.assigneeId !== undefined) return badRequest([{ path: ["assigneeId"], message: "Private tasks aren't assignable" }]);
    if (patch.milestoneId !== undefined) return badRequest([{ path: ["milestoneId"], message: "Only a task (not a step) sits in a milestone" }]);
  }

  const row = await updateWork(user, params.id, patch);
  return NextResponse.json(serializeTask(row));
});

/** Soft delete: the task and its steps get one shared timestamp. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const { ids, deletedAt } = await deleteWork(user, params.id);
  return NextResponse.json({ ok: true, ids, deletedAt: deletedAt.toISOString() });
});
