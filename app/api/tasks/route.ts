import { NextResponse } from "next/server";
import { generateKeyBetween } from "fractional-indexing";
import { prisma } from "@/lib/prisma";
import { TASK_INCLUDE, serializeTask, withCounts, type TaskRow } from "@/lib/serialize";
import { requireUser, route } from "@/lib/session";
import { visibleProjectIds } from "@/lib/project-visibility";
import { flattenToOneLevel } from "@/lib/steps";
import { noteCounts } from "@/lib/work/activity";
import { createWork } from "@/lib/work/tasks";
import { badRequest, createTaskSchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function finish(rows: TaskRow[], flatten: boolean) {
  const flat = flatten ? flattenToOneLevel(rows) : rows;
  const counts = await noteCounts(flat.map((r) => r.id), true);
  return withCounts(flat, counts).map(serializeTask);
}

/**
 * Flat list for one project (steps carry parentId = their root task). `?view=all`
 * widens that to every visible project — what Today needs. `?scope=private`
 * is the caller's My notes. The work queue with its filters is GET /api/work.
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
 * Open a task (work model). With a projectId it is a project task (anyone on
 * the project; a step needs the same); without one it stands on its own and
 * is routed Department → Team → Person by the rules. Every rule lives in
 * lib/work/tasks.ts — this handler only parses.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();

  const parsed = await parseBody(req, createTaskSchema);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.isPrivate) {
    return createPrivateTask(user.id, parsed.data);
  }

  const { isPrivate: _p, personalProjectId: _pp, ...input } = parsed.data;
  void _p;
  void _pp;
  const row = await createWork(user, input);
  return NextResponse.json(serializeTask(row), { status: 201 });
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

  // A private note keeps the old four words; state mirrors them so nothing reads odd.
  const st = status ?? "TODO";
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
      status: st,
      state: st === "DONE" ? "CLOSED" : st === "DOING" ? "IN_PROGRESS" : st === "STUCK" ? "WAITING" : "NEW",
      type: "GENERAL",
      requesterId: ownerId,
      dueDate: due,
      dueProvisional: false,
      assigneeId: null,
      ...(st === "DONE" ? { completedAt: new Date(), completedById: ownerId, resolvedAt: new Date(), closedAt: new Date(), resolutionCode: "COMPLETED" } : {}),
      ...(st === "STUCK" ? { waitingReason: "OTHER" } : {}),
    },
    include: TASK_INCLUDE,
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
}
