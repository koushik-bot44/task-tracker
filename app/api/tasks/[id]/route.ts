import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asGates, gateDoneChanges } from "@/lib/gates";
import { COMPLETED_BY_SELECT, serializeTask } from "@/lib/serialize";
import { assertCanSetAssignee, assertCanToggleGates } from "@/lib/permissions";
import { canAccessTask } from "@/lib/project-visibility";
import { isGroupTint } from "@/lib/group-tints";
import { requireUser, route } from "@/lib/session";
import { badRequest, parseBody, updateTaskSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * The row set a subtree walk is allowed to touch. A project task scopes by its
 * project; a PRIVATE task (phase 15) scopes by its owner so a null projectId can
 * never sweep in every user's private tasks.
 */
function taskScope(task: {
  isPrivate: boolean;
  ownerId: string | null;
  projectId: string | null;
}): Prisma.TaskWhereInput {
  return task.isPrivate
    ? { ownerId: task.ownerId, isPrivate: true }
    : { projectId: task.projectId };
}

/** Ids of `rootId` plus everything beneath it, walked over one flat fetch. */
async function subtreeIds(
  scope: Prisma.TaskWhereInput,
  rootId: string,
  opts: { includeDeleted: boolean },
): Promise<string[]> {
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

/**
 * A single task, so the detail panel can open from Focus or the Changelog
 * where the owning project's flat list is not already in cache.
 */
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();

  const task = await prisma.task.findFirst({
    where: { id: params.id, deletedAt: null },
    include: COMPLETED_BY_SELECT,
  });
  // A developer can't read a task in a project they aren't a member of, and a
  // PRIVATE task is readable only by its owner — the 404 discloses neither.
  if (!task || !(await canAccessTask(user, task))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json(serializeTask(task));
});

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();

  const parsed = await parseBody(req, updateTaskSchema);
  if (!parsed.ok) return parsed.response;
  const patch = parsed.data;

  const existing = await prisma.task.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  // A developer can't touch a task in a project they aren't a member of, and a
  // PRIVATE task is writable only by its owner.
  if (!(await canAccessTask(user, existing))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Undo path: restore this task and everything that went down with it. One
  // delete stamps one timestamp across its subtree, so that timestamp is the receipt.
  if (patch.deletedAt === null && existing.deletedAt) {
    const stamp = existing.deletedAt;
    await prisma.task.updateMany({
      // Scoped so restoring a private task never revives another owner's rows.
      where: { ...taskScope(existing), deletedAt: stamp },
      data: { deletedAt: null },
    });
    const restored = await prisma.task.findUnique({
      where: { id: params.id },
      include: COMPLETED_BY_SELECT,
    });
    return NextResponse.json(serializeTask(restored!));
  }

  if (existing.deletedAt) {
    return NextResponse.json({ error: "Task is deleted" }, { status: 409 });
  }

  const data: Prisma.TaskUpdateInput = {};

  if (patch.title !== undefined) data.title = patch.title;
  if (patch.descriptionMd !== undefined) data.descriptionMd = patch.descriptionMd;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.gates !== undefined) {
    // Verified is the manager's; the other four are the team's. One rule,
    // in lib/permissions, keyed off which gates actually flipped.
    assertCanToggleGates(user, gateDoneChanges(asGates(existing.gates), patch.gates));
    data.gates = patch.gates;
  }

  if (patch.color !== undefined) data.color = patch.color;

  if (patch.groupColor !== undefined) {
    // A soft grouping band (phase 15): a valid tint key, or null to remove it.
    if (patch.groupColor !== null && !isGroupTint(patch.groupColor)) {
      return badRequest([{ path: ["groupColor"], message: "Unknown group colour" }]);
    }
    data.groupColor = patch.groupColor;
  }

  if (patch.assigneeId !== undefined) {
    // A private task (phase 15) is inherently its owner's — never assignable.
    if (existing.isPrivate) {
      return badRequest([{ path: ["assigneeId"], message: "Private tasks aren't assignable" }]);
    }
    // Only root tasks carry an assignee (phase 11). A subtask ignores it.
    if (existing.parentId !== null) {
      return badRequest([{ path: ["assigneeId"], message: "Subtasks can't be assigned" }]);
    }
    assertCanSetAssignee(user, existing, patch.assigneeId);
    if (patch.assigneeId === null) {
      data.assignee = { disconnect: true };
    } else {
      const target = await prisma.user.findUnique({
        where: { id: patch.assigneeId },
        select: { disabledAt: true, role: true },
      });
      // Phase 35: a PERSON is never a work account, so never an assignee.
      if (!target || target.disabledAt || target.role === "PERSON") {
        return badRequest([{ path: ["assigneeId"], message: "Must be an active user" }]);
      }
      data.assignee = { connect: { id: patch.assigneeId } };
    }
  }
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.links !== undefined) data.links = patch.links;
  if (patch.orderKey !== undefined) data.orderKey = patch.orderKey;

  if (patch.deliverableUrl !== undefined) data.deliverableUrl = patch.deliverableUrl;

  if (patch.pinnedAt !== undefined) {
    if (patch.pinnedAt === null) {
      data.pinnedAt = null;
    } else {
      const pinned = new Date(patch.pinnedAt);
      if (Number.isNaN(pinned.getTime())) {
        return NextResponse.json({ error: "pinnedAt is not a date" }, { status: 400 });
      }
      data.pinnedAt = pinned;
    }
  }

  if (patch.dueDate !== undefined) {
    /* Any hand on the date makes it real. There is no separate "confirm"
       gesture — editing it IS the confirmation, and clearing it leaves nothing
       to be provisional about. */
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
    // Entering DONE stamps who finished it and when; leaving clears both, so
    // the Review queue never credits work that was reopened.
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
      return NextResponse.json({ error: "A task cannot parent itself" }, { status: 400 });
    }
    if (newParentId !== null) {
      const parent = await prisma.task.findFirst({
        // The new parent must live in the same scope — same project, or (private)
        // the same owner — so a task can never be re-filed across the boundary.
        where: { id: newParentId, ...taskScope(existing), deletedAt: null },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent not found" }, { status: 400 });
      }
      // Reparenting into your own subtree would orphan the whole branch.
      const subtree = await subtreeIds(taskScope(existing), params.id, {
        includeDeleted: false,
      });
      if (subtree.includes(newParentId)) {
        return NextResponse.json(
          { error: "Cannot move a task inside its own subtree" },
          { status: 400 },
        );
      }
      data.parent = { connect: { id: newParentId } };
    } else {
      data.parent = { disconnect: true };
    }
  }

  const task = await prisma.task.update({
    where: { id: params.id },
    data,
    include: COMPLETED_BY_SELECT,
  });
  return NextResponse.json(serializeTask(task));
});

/** Soft delete: the task and its whole subtree get one shared timestamp. */
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();

  const existing = await prisma.task.findUnique({
    where: { id: params.id },
    select: { id: true, projectId: true, deletedAt: true, isPrivate: true, ownerId: true },
  });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  // Same door as GET/PATCH: a developer can't delete a task in a project they
  // aren't a member of, and a private task is deletable only by its owner.
  if (!(await canAccessTask(user, existing))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const ids = await subtreeIds(taskScope(existing), params.id, { includeDeleted: false });
  const deletedAt = new Date();

  await prisma.task.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt },
  });

  return NextResponse.json({ ok: true, ids, deletedAt: deletedAt.toISOString() });
});
