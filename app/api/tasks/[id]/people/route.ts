import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { canAssignTask } from "@/lib/work/access";
import { recordSystem } from "@/lib/work/activity";
import { loadWork, requireSee } from "@/lib/work/tasks";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const bodySchema = z.object({ assigneeIds: z.array(z.string().min(1)).min(1).max(50) });

/** Everybody on this task — whoever holds it included. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  await requireSee(user, params.id);
  const rows = await prisma.taskPerson.findMany({
    where: { taskId: params.id },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(rows.map((r) => r.user));
});

/**
 * Put more people on this task.
 *
 * ONE task, several people, one chat between them (owner, 2026-09-15: "multiple
 * people to the same task as group chat"). It used to copy the record once per
 * person, so each had a private chat on their own copy — which is exactly what
 * the owner objected to. Adding somebody is now a row, not a record. The people
 * already on it are skipped, so pressing it twice adds nothing.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { scope, root } = await requireSee(user, params.id);
  if (!(await canAssignTask(user, root, scope))) {
    throw new HttpError(403, "You can't hand this task to anybody.");
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const source = await prisma.task.findUnique({
    where: { id: params.id },
    select: { id: true, deletedAt: true, parentId: true, people: { select: { userId: true } } },
  });
  if (!source || source.deletedAt) throw new HttpError(404, "Task not found");
  if (source.parentId) throw new HttpError(400, "A step belongs to its task's person.");

  const already = new Set(source.people.map((p) => p.userId));
  const made: string[] = [];
  const skipped: string[] = [];
  for (const userId of new Set(parsed.data.assigneeIds)) {
    if (already.has(userId)) { skipped.push(userId); continue; }
    const who = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, disabledAt: true, role: true } });
    if (!who || who.disabledAt || who.role === "PERSON" || who.role === "ADMIN") { skipped.push(userId); continue; }
    await prisma.taskPerson.create({ data: { taskId: source.id, userId, addedById: user.id } });
    made.push(userId);
    already.add(userId);
  }
  if (made.length) {
    const names = await prisma.user.findMany({ where: { id: { in: made } }, select: { name: true } });
    await recordSystem(prisma, source.id, `${names.map((n) => n.name).join(", ")} added to this task`, { people: made }, user.id);
  }

  const { row, access } = await loadWork(user, params.id);
  return NextResponse.json({ added: made.length, skipped, task: { ...serializeTask(row), access } }, { status: 201 });
});

/**
 * Take somebody off this task. The task itself stays, with everybody else on it.
 *
 * Whoever HOLDS it is taken off by clearing "Assigned to" instead — the holder
 * is who the task is waiting on, which is a different thing from being on it.
 */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { scope, root } = await requireSee(user, params.id);
  if (!(await canAssignTask(user, root, scope))) {
    throw new HttpError(403, "You can't change who is on this task.");
  }

  const parsed = await parseBody(req, z.object({ assigneeId: z.string().min(1) }));
  if (!parsed.ok) return parsed.response;

  const here = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true, assigneeId: true } });
  if (!here) throw new HttpError(404, "Task not found");
  if (here.assigneeId === parsed.data.assigneeId) {
    throw new HttpError(400, "That is who the task is waiting on — clear Assigned to instead.");
  }

  const gone = await prisma.taskPerson.deleteMany({ where: { taskId: here.id, userId: parsed.data.assigneeId } });
  if (gone.count === 0) throw new HttpError(404, "They are not on this task.");

  const who = await prisma.user.findUnique({ where: { id: parsed.data.assigneeId }, select: { name: true } });
  await recordSystem(prisma, here.id, `${who?.name ?? "Somebody"} taken off this task`, { off: parsed.data.assigneeId }, user.id);

  const { row, access } = await loadWork(user, params.id);
  return NextResponse.json({ removed: gone.count, task: { ...serializeTask(row), access } });
});
