import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TASK_INCLUDE, serializeTask, withCounts } from "@/lib/serialize";
import { assertCanAssign } from "@/lib/permissions";
import { canAccessTask } from "@/lib/project-visibility";
import { requireUser, route } from "@/lib/session";
import { syncProjectReviews } from "@/lib/meetings";
import { sendMessage } from "@/lib/notify";
import { taskGivenMessage } from "@/lib/messages";
import { badRequest, parseBody, updateTaskSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

function taskScope(task: { isPrivate: boolean; ownerId: string | null; projectId: string | null }): Prisma.TaskWhereInput {
  return task.isPrivate ? { ownerId: task.ownerId, isPrivate: true } : { projectId: task.projectId };
}

/** Ids of `rootId` plus everything beneath it, walked over one flat fetch. */
async function subtreeIds(scope: Prisma.TaskWhereInput, rootId: string, opts: { includeDeleted: boolean }): Promise<string[]> {
  const rows = await prisma.task.findMany({
    where: { ...scope, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
    select: { id: true, parentId: true },
  });
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = childrenOf.get(row.parentId);
    if (list) list.push(row.id);
    else childrenOf.set(row.parentId, [row.id]);
  }
  const out = [rootId];
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    out.push(next);
    stack.push(...(childrenOf.get(next) ?? []));
  }
  return out;
}

async function loadOne(id: string) {
  const task = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  if (!task) return null;
  const [steps, notes] = await Promise.all([
    prisma.task.findMany({ where: { parentId: id, deletedAt: null }, select: { id: true, parentId: true, status: true, deletedAt: true } }),
    prisma.comment.count({ where: { targetType: "TASK", targetId: id } }),
  ]);
  const [row] = withCounts([task, ...steps.map((s) => ({ ...task, ...s }))], new Map([[id, notes]]));
  return row;
}

/** A single task, so the drawer can open from Today where the project list is not in cache. */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const task = await prisma.task.findFirst({ where: { id: params.id, deletedAt: null }, select: { isPrivate: true, ownerId: true, projectId: true } });
  if (!task || !(await canAccessTask(user, task))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const row = await loadOne(params.id);
  return NextResponse.json(serializeTask(row!));
});

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();

  const parsed = await parseBody(req, updateTaskSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  const existing = await prisma.task.findUnique({ where: { id: params.id }, include: { project: { select: { name: true, slug: true } } } });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!(await canAccessTask(user, existing))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Undo path: restore this task and everything that went down with it.
  if (patch.deletedAt === null && existing.deletedAt) {
    const stamp = existing.deletedAt;
    await prisma.task.updateMany({ where: { ...taskScope(existing), deletedAt: stamp }, data: { deletedAt: null } });
    const restored = await loadOne(params.id);
    return NextResponse.json(serializeTask(restored!));
  }
  if (existing.deletedAt) {
    return NextResponse.json({ error: "Task is deleted" }, { status: 409 });
  }

  const data: Prisma.TaskUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.descriptionMd !== undefined) data.descriptionMd = patch.descriptionMd;
  if (patch.important !== undefined) data.important = patch.important;
  if (patch.archived !== undefined) data.archived = patch.archived;
  if (patch.orderKey !== undefined) data.orderKey = patch.orderKey;
  if (patch.deliverableUrl !== undefined) data.deliverableUrl = patch.deliverableUrl;

  let reassignedTo: string | null = null;
  if (patch.assigneeId !== undefined) {
    if (existing.isPrivate) {
      return badRequest([{ path: ["assigneeId"], message: "Private tasks aren't assignable" }]);
    }
    if (existing.parentId !== null) {
      return badRequest([{ path: ["assigneeId"], message: "A step belongs to its task's person" }]);
    }
    await assertCanAssign(user, existing.projectId!, patch.assigneeId);
    if (patch.assigneeId === null) {
      data.assignee = { disconnect: true };
    } else {
      data.assignee = { connect: { id: patch.assigneeId } };
      if (patch.assigneeId !== existing.assigneeId) {
        data.givenBy = { connect: { id: user.id } };
        reassignedTo = patch.assigneeId;
      }
    }
  }

  if (patch.milestoneId !== undefined) {
    if (existing.isPrivate || existing.parentId !== null) {
      return badRequest([{ path: ["milestoneId"], message: "Only a task (not a step) sits in a milestone" }]);
    }
    if (patch.milestoneId === null) {
      data.milestone = { disconnect: true };
    } else {
      const m = await prisma.milestone.findFirst({ where: { id: patch.milestoneId, projectId: existing.projectId! }, select: { id: true } });
      if (!m) return badRequest([{ path: ["milestoneId"], message: "Milestone not found" }]);
      data.milestone = { connect: { id: m.id } };
    }
  }

  if (patch.dueDate !== undefined) {
    data.dueProvisional = false;
    if (patch.dueDate === null) {
      data.dueDate = null;
    } else {
      const parsedDate = new Date(patch.dueDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "dueDate is not a date" }, { status: 400 });
      }
      data.dueDate = parsedDate;
    }
  }

  if (patch.status !== undefined) {
    data.status = patch.status;
    if (patch.status === "DONE" && existing.status !== "DONE") {
      data.completedAt = new Date();
      data.completedBy = { connect: { id: user.id } };
    } else if (patch.status !== "DONE" && existing.status === "DONE") {
      data.completedAt = null;
      data.completedBy = { disconnect: true };
    }
  }

  if (patch.parentId !== undefined) {
    const newParentId = patch.parentId;
    if (newParentId === params.id) {
      return NextResponse.json({ error: "A task cannot be its own step" }, { status: 400 });
    }
    if (newParentId !== null) {
      const parent = await prisma.task.findFirst({
        where: { id: newParentId, ...taskScope(existing), deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent not found" }, { status: 400 });
      }
      const subtree = await subtreeIds(taskScope(existing), params.id, { includeDeleted: false });
      if (subtree.includes(newParentId)) {
        return NextResponse.json({ error: "Cannot move a task inside its own steps" }, { status: 400 });
      }
      // Project tasks stay one level deep: re-point to the root.
      data.parent = { connect: { id: existing.isPrivate ? newParentId : (parent.parentId ?? parent.id) } };
      if (!existing.isPrivate) {
        data.assignee = { disconnect: true };
      }
    } else {
      data.parent = { disconnect: true };
    }
  }

  // A step follows its task's milestone and person; the task's steps follow it.
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: params.id }, data });
    if (!existing.isPrivate && existing.parentId === null && patch.milestoneId !== undefined) {
      await tx.task.updateMany({ where: { parentId: params.id }, data: { milestoneId: patch.milestoneId } });
    }
    if (patch.archived !== undefined && existing.parentId === null) {
      await tx.task.updateMany({ where: { parentId: params.id }, data: { archived: patch.archived } });
    }
  });

  if (reassignedTo && reassignedTo !== user.id && existing.project) {
    try {
      await sendMessage(
        [reassignedTo],
        taskGivenMessage({
          taskId: existing.id,
          taskTitle: patch.title ?? existing.title,
          projectName: existing.project.name,
          projectSlug: existing.project.slug,
          giverName: user.name,
          dueDate: patch.dueDate !== undefined ? (data.dueDate as Date | null) : existing.dueDate,
        }),
      );
    } catch (err) {
      console.error("[tasks] task_given failed:", (err as Error).message);
    }
  }
  if ((patch.assigneeId !== undefined || patch.milestoneId !== undefined || patch.archived !== undefined) && existing.projectId) {
    syncProjectReviews(existing.projectId, user.id).catch(() => undefined);
  }

  const row = await loadOne(params.id);
  return NextResponse.json(serializeTask(row!));
});

/** Soft delete: the task and its steps get one shared timestamp. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();

  const existing = await prisma.task.findUnique({
    where: { id: params.id },
    select: { id: true, projectId: true, deletedAt: true, isPrivate: true, ownerId: true },
  });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!(await canAccessTask(user, existing))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const ids = await subtreeIds(taskScope(existing), params.id, { includeDeleted: false });
  const deletedAt = new Date();
  await prisma.task.updateMany({ where: { id: { in: ids } }, data: { deletedAt } });
  if (existing.projectId) syncProjectReviews(existing.projectId, user.id).catch(() => undefined);

  return NextResponse.json({ ok: true, ids, deletedAt: deletedAt.toISOString() });
});
