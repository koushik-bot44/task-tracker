import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { TASK_INCLUDE, serializeTask, withCounts, type TaskRow } from "@/lib/serialize";
import { assertCanAssign } from "@/lib/permissions";
import { requireUser, route } from "@/lib/session";
import { visibleProjectIds } from "@/lib/project-visibility";
import { flattenToOneLevel } from "@/lib/steps";
import { syncProjectReviews } from "@/lib/meetings";
import { sendMessage } from "@/lib/notify";
import { taskGivenMessage } from "@/lib/messages";
import { badRequest, createTaskSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Note counts for a set of tasks, in one grouped query. */
async function noteCountsFor(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const grouped = await prisma.comment.groupBy({
    by: ["targetId"],
    where: { targetType: "TASK", targetId: { in: ids } },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.targetId, g._count._all]));
}

async function finish(rows: TaskRow[], flatten: boolean) {
  const flat = flatten ? flattenToOneLevel(rows) : rows;
  const counts = await noteCountsFor(flat.map((r) => r.id));
  return withCounts(flat, counts).map(serializeTask);
}

/**
 * Flat list for one project (steps carry parentId = their root task). `?view=all`
 * widens that to every visible project — what Today needs. `?scope=private`
 * is the caller's My notes.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;

  if (params.get("scope") === "private") {
    const rows = await prisma.task.findMany({
      where: { ownerId: user.id, isPrivate: true, deletedAt: null },
      orderBy: { orderKey: "asc" },
      include: TASK_INCLUDE,
    });
    return NextResponse.json(await finish(rows, false));
  }

  const visible = await visibleProjectIds(user);

  if (params.get("view") === "all") {
    const all = await prisma.task.findMany({
      where: { deletedAt: null, isPrivate: false, archived: false, ...(visible ? { projectId: { in: [...visible] } } : {}) },
      orderBy: { orderKey: "asc" },
      include: TASK_INCLUDE,
    });
    return NextResponse.json(await finish(all, true));
  }

  const projectId = params.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  if (visible && !visible.has(projectId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { orderKey: "asc" },
    include: TASK_INCLUDE,
  });
  return NextResponse.json(await finish(tasks, true));
});

/**
 * Give a task (restructure). Anyone on the project gives a task to anyone on
 * it; the chain and leads may name someone not yet on it (they are added).
 * A root task carries the assignee, the date (default: its milestone's review
 * date) and who gave it; a step carries neither an assignee nor a message.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();

  const parsed = await parseBody(req, createTaskSchema);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.isPrivate) {
    return createPrivateTask(user.id, parsed.data);
  }

  const { id, projectId, parentId, milestoneId, title, orderKey, status, dueDate, assigneeId, dueProvisional, important } = parsed.data;

  if (!projectId) {
    return badRequest([{ path: ["projectId"], message: "A projectId is required" }]);
  }
  const visible = await visibleProjectIds(user);
  if (visible && !visible.has(projectId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (parentId && assigneeId) {
    return NextResponse.json({ error: "A step belongs to its task's person" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, slug: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let due: Date | null = null;
  if (dueDate) {
    due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: "dueDate is not a date" }, { status: 400 });
    }
  }
  let guessed = dueProvisional === true;

  let effectiveMilestoneId: string | null = milestoneId ?? null;
  let parentRoot: string | null = null;
  if (parentId) {
    const parent = await prisma.task.findFirst({
      where: { id: parentId, projectId, deletedAt: null },
      select: { id: true, parentId: true, dueDate: true, dueProvisional: true, milestoneId: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 400 });
    }
    // One level deep: a step of a step is a step of the root task.
    parentRoot = parent.parentId ?? parent.id;
    effectiveMilestoneId = parent.milestoneId;
    if (!due) {
      due = parent.dueDate;
      if (due) guessed = parent.dueProvisional;
    }
  } else if (effectiveMilestoneId) {
    const m = await prisma.milestone.findFirst({ where: { id: effectiveMilestoneId, projectId }, select: { reviewDate: true } });
    if (!m) return NextResponse.json({ error: "Milestone not found" }, { status: 400 });
    // "By when?" defaults to the box's review date.
    if (!due) {
      due = m.reviewDate;
      guessed = true;
    }
  }

  let assignTo: string | null = null;
  if (!parentId) {
    assignTo = assigneeId === undefined ? user.id : assigneeId;
    await assertCanAssign(user, projectId, assignTo);
  }

  let key = orderKey;
  if (!key) {
    const last = await prisma.task.findFirst({
      where: { projectId, parentId: parentRoot ?? null, deletedAt: null },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    key = generateKeyBetween(last?.orderKey ?? null, null);
  }

  const task = await prisma.task.create({
    data: {
      ...(id ? { id } : {}),
      projectId,
      parentId: parentRoot,
      milestoneId: effectiveMilestoneId,
      title: title ?? "",
      orderKey: key,
      status: status ?? "TODO",
      dueDate: due,
      dueProvisional: due ? guessed : false,
      important: important ?? false,
      assigneeId: assignTo,
      givenById: user.id,
      ...(status === "DONE" ? { completedAt: new Date(), completedById: user.id } : {}),
    },
    include: TASK_INCLUDE,
  });

  // (a) task_given — instant, to the person it was given to (never to yourself).
  if (assignTo && assignTo !== user.id && (title ?? "").trim().length > 0) {
    try {
      await sendMessage(
        [assignTo],
        taskGivenMessage({
          taskId: task.id,
          taskTitle: task.title,
          projectName: project.name,
          projectSlug: project.slug,
          giverName: user.name,
          dueDate: task.dueDate,
        }),
      );
    } catch (err) {
      console.error("[tasks] task_given failed:", (err as Error).message);
    }
  }
  // The milestone's review meeting invites everyone holding a task in it.
  if (assignTo && effectiveMilestoneId) {
    syncProjectReviews(projectId, user.id).catch(() => undefined);
  }

  return NextResponse.json(serializeTask({ ...task, stepCount: 0, stepsDone: 0, noteCount: 0 }), { status: 201 });
});

/**
 * Create a PRIVATE task (My notes). It belongs to the caller and to no
 * project; it is never assigned and needs no date. Every private task lives
 * in one of the caller's own PersonalProjects; a subtask inherits its parent's.
 */
async function createPrivateTask(
  ownerId: string,
  data: {
    id?: string;
    personalProjectId?: string | null;
    parentId?: string | null;
    title?: string;
    descriptionMd?: string;
    orderKey?: string;
    status?: "TODO" | "DOING" | "STUCK" | "DONE";
    dueDate?: string | null;
  },
) {
  const { id, personalProjectId, parentId, title, descriptionMd, orderKey, status, dueDate } = data;

  let due: Date | null = null;
  if (dueDate) {
    due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: "dueDate is not a date" }, { status: 400 });
    }
  }

  let effectivePpid: string;
  if (parentId) {
    const parent = await prisma.task.findFirst({
      where: { id: parentId, ownerId, isPrivate: true, deletedAt: null },
      select: { id: true, personalProjectId: true },
    });
    if (!parent || !parent.personalProjectId) {
      return NextResponse.json({ error: "Parent not found" }, { status: 400 });
    }
    effectivePpid = parent.personalProjectId;
  } else {
    if (!personalProjectId) {
      return badRequest([{ path: ["personalProjectId"], message: "A personalProjectId is required" }]);
    }
    const pp = await prisma.personalProject.findFirst({ where: { id: personalProjectId, ownerId }, select: { id: true } });
    if (!pp) {
      return badRequest([{ path: ["personalProjectId"], message: "Unknown personal project" }]);
    }
    effectivePpid = personalProjectId;
  }

  let key = orderKey;
  if (!key) {
    const last = await prisma.task.findFirst({
      where: { ownerId, isPrivate: true, personalProjectId: effectivePpid, parentId: parentId ?? null, deletedAt: null },
      orderBy: { orderKey: "desc" },
      select: { orderKey: true },
    });
    key = generateKeyBetween(last?.orderKey ?? null, null);
  }

  const task = await prisma.task.create({
    data: {
      ...(id ? { id } : {}),
      projectId: null,
      isPrivate: true,
      ownerId,
      personalProjectId: effectivePpid,
      parentId: parentId ?? null,
      title: title ?? "",
      descriptionMd: descriptionMd ?? "",
      orderKey: key,
      status: status ?? "TODO",
      dueDate: due,
      dueProvisional: false,
      assigneeId: null,
      ...(status === "DONE" ? { completedAt: new Date(), completedById: ownerId } : {}),
    },
    include: TASK_INCLUDE,
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
}
