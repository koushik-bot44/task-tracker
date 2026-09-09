import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/serialize";
import { HttpError, requireUser, route } from "@/lib/session";
import { canAssignTask } from "@/lib/work/access";
import { createWork, loadWork, requireSee } from "@/lib/work/tasks";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const bodySchema = z.object({ assigneeIds: z.array(z.string().min(1)).min(1).max(50) });

/** Everyone holding this same task — the record's own holder included. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  await requireSee(user, params.id);
  const task = await prisma.task.findUnique({ where: { id: params.id }, select: { siblingKey: true, assignee: { select: { id: true, name: true } } } });
  if (!task) throw new HttpError(404, "Task not found");
  if (!task.siblingKey) return NextResponse.json(task.assignee ? [task.assignee] : []);
  const rows = await prisma.task.findMany({
    where: { siblingKey: task.siblingKey, deletedAt: null, assigneeId: { not: null } },
    select: { assignee: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  // One entry per PERSON, however many records they hold.
  const seen = new Set<string>();
  const people = rows
    .map((r) => r.assignee)
    .filter((a): a is { id: string; name: string } => Boolean(a))
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  return NextResponse.json(people);
});

/**
 * Give this same task to more people.
 *
 * One task per person is the model — each finishes their own — so this copies
 * the record once per new person and ties them all together with one key. The
 * people already on it are skipped, so pressing it twice adds nothing.
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
    select: {
      id: true, siblingKey: true, title: true, descriptionMd: true, type: true, priority: true,
      projectId: true, milestoneId: true, departmentId: true, assignmentGroupId: true,
      categoryId: true, requesterId: true, dueDate: true, assigneeId: true, deletedAt: true, parentId: true,
    },
  });
  if (!source || source.deletedAt) throw new HttpError(404, "Task not found");
  if (source.parentId) throw new HttpError(400, "A step belongs to its task's person.");

  // The first time a task is shared it needs a key, and the record already
  // here joins the group too.
  const key = source.siblingKey ?? randomUUID();
  if (!source.siblingKey) await prisma.task.update({ where: { id: source.id }, data: { siblingKey: key } });

  const held = new Set(
    (await prisma.task.findMany({ where: { siblingKey: key, deletedAt: null }, select: { assigneeId: true } }))
      .map((t) => t.assigneeId)
      .filter((id): id is string => Boolean(id)),
  );

  const made: string[] = [];
  const skipped: string[] = [];
  for (const assigneeId of new Set(parsed.data.assigneeIds)) {
    if (held.has(assigneeId)) { skipped.push(assigneeId); continue; }
    const who = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, disabledAt: true, role: true } });
    if (!who || who.disabledAt || who.role === "PERSON" || who.role === "ADMIN") { skipped.push(assigneeId); continue; }
    const row = await createWork(user, {
      title: source.title,
      descriptionMd: source.descriptionMd,
      type: source.type,
      priority: source.priority,
      categoryId: source.categoryId,
      requesterId: source.requesterId,
      departmentId: source.departmentId,
      assignmentGroupId: source.assignmentGroupId,
      projectId: source.projectId,
      milestoneId: source.milestoneId,
      dueDate: source.dueDate ? source.dueDate.toISOString() : null,
      assigneeId,
      siblingKey: key,
    });
    made.push(row.id);
    held.add(assigneeId);
  }

  const { row, access } = await loadWork(user, params.id);
  return NextResponse.json({ added: made.length, skipped, task: { ...serializeTask(row), access } }, { status: 201 });
});

/**
 * Take somebody off this task: their own copy goes, the rest stay.
 *
 * The record being looked at is never the one removed — letting it delete
 * itself would leave the reader on a page that no longer exists. Whoever holds
 * THIS record is taken off by clearing "Assigned to" instead.
 */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { scope, root } = await requireSee(user, params.id);
  if (!(await canAssignTask(user, root, scope))) {
    throw new HttpError(403, "You can't change who is on this task.");
  }

  const parsed = await parseBody(req, z.object({ assigneeId: z.string().min(1) }));
  if (!parsed.ok) return parsed.response;

  const here = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true, siblingKey: true, assigneeId: true } });
  if (!here?.siblingKey) throw new HttpError(404, "Nobody else is on this task.");
  if (here.assigneeId === parsed.data.assigneeId) {
    throw new HttpError(400, "That is this record's own holder — clear Assigned to instead.");
  }

  const theirs = await prisma.task.findMany({
    where: { siblingKey: here.siblingKey, assigneeId: parsed.data.assigneeId, deletedAt: null, id: { not: here.id } },
    select: { id: true },
  });
  if (theirs.length === 0) throw new HttpError(404, "They are not on this task.");

  // Soft delete, like every other way a task goes away — the history is kept.
  await prisma.task.updateMany({ where: { id: { in: theirs.map((t) => t.id) } }, data: { deletedAt: new Date() } });

  const left = await prisma.task.count({ where: { siblingKey: here.siblingKey, deletedAt: null } });
  // Down to one, it is nobody's shared task any more.
  if (left <= 1) await prisma.task.updateMany({ where: { siblingKey: here.siblingKey }, data: { siblingKey: null } });

  const { row, access } = await loadWork(user, params.id);
  return NextResponse.json({ removed: theirs.length, task: { ...serializeTask(row), access } });
});
